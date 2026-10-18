#!/usr/bin/env python3
"""Independent cross-check of the period <=12 catalog core (ADR 0014).

Reads only the shipped files, catalog/core.v1.bin and catalog/core.v1.json,
and shares no code with the generator: its own decoder, its own counts, and
exact integer arithmetic in place of the generator's decimals. For every
record it proves, at the stored binary64 centre c0 itself, that the disk
B(c0, rho) holds exactly one root of g(c) = f_c^p(0), a simple one, of exact
period p (Rouche's theorem, where the generator uses the Krawczyk test). It
also checks the counts per period against OEIS A000740, the residuals,
conjugate closure, that the disks of one period are disjoint, the half-plane
and real-axis order invariants, and that the component size estimate is
finite and positive.

It then proves that each record's rays belong to its centre. The pairs must
be Lavaurs' pairs (recomputed here), and tools/crosscheck_rays.py proves
that the two dynamic rays of each pair land together for f_c, c in the
proved disk of the record's centre (or, for the decimal fallback, in a
smaller proved disk shown to lie inside it). By the wake theorem the centre
c_P of the record of pair P then lies in the wake W_P, and induction gives
the association:

Association. Let H_P be the period-p component whose root the parameter rays
of P land at. c_P is a centre of a period-p component H (fact a), and H lies
in W_P: H is connected, meets W_P at c_P, and misses its boundary, which is
two parameter rays outside M and a root, which is in no hyperbolic component
(fact d). Suppose H is not H_P. Its root pair P' differs from P (facts a, b),
and H lies in W_P', so the two wakes nest (fact c). W_P inside W_P' is
impossible: the root of P' lies on the boundary of H, so in the closure of
W_P; it is neither on P's rays nor P's root (fact b), so it would lie in W_P,
inside the open W_P', on whose boundary it lies. So W_P' lies strictly inside
W_P, and by induction on the number of period-p wakes inside a wake, the record
of P' holds H's centre. Two records would then share a centre, but their disks
are disjoint. So H is H_P, for every pair P. (Period 1 has one centre, 0.)

Trust base. The proofs rely on these and nothing else:
- IEEE-754 binary64 with round-to-nearest, where only +, -, *, /, math.sqrt and
  exact operations enter a bound; Python's integers, fractions and decimal
  module (each decimal operation correctly rounded to the context's precision).
- Rouche's theorem, with the deviation bounds of disk_radii (proved there by
  induction from f_(n+1) = f_n^2 + c) and magnitude_bounds (integer square roots
  of truncated coordinates, floored and ceiled).
- Gleason's lemma: the roots of f_c^p(0) are simple, so the Mobius count
  (1/2) sum over d | p of mu(p/d) 2^d is the number of period-p centres, and
  the records, being that many distinct roots of exact period p, are all of them.
- Douady and Hubbard (Orsay notes, 1984-85; Milnor 2000), the facts used above:
  (a) c is the centre of a period-p hyperbolic component exactly when 0 has
  exact period p under f_c, and each component has one centre and one root;
  (b) for p >= 2 each root of a period-p component is the landing point of
  exactly two parameter rays, both of period p and landing nowhere else, the
  component lies in their wake, and distinct components have distinct roots;
  (c) parameter rays are disjoint and lie outside M, so wakes of distinct
  period-p pairs are nested or disjoint; (d) roots are parabolic parameters,
  in no hyperbolic component.
- Lavaurs (1986): the pairs of period-p parameter rays that land together are
  those of his algorithm, recomputed by lavaurs_pairs.
- The wake theorem (Douady and Hubbard; Milnor 2000, Theorem 1.2): the dynamic
  rays of a pair land together only for c in the closed wake of the pair.
- Everything in tools/crosscheck_rays.py's own trust base (Bottcher's theorem,
  the maximum principle, the Schwarz-Pick lemma, Banach's fixed-point theorem).
- Proved here, as elementary lemmas: exact period from |f^d(0)| bounded away
  from 0 on the disk for each proper divisor d (prove_root_at); distinct
  centres from disjoint disks, with a scan that stops only past the largest
  radius (check_collection); the refined disk's root being the record's own,
  by |c1 - c0| + rho1 <= rho in exact fractions (refined_disk).

Usage: python3 tools/crosscheck_catalog_core.py catalog [--workers N]

This module is application source code, licensed under GPL-3.0-only.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from decimal import Decimal, localcontext
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys

from crosscheck_rays import Landing, prove_rays_land_together

# Hyperbolic components of exact period p = 1..12 (OEIS A000740); 4,016 in all.
A000740 = (1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010)
HEADER = struct.Struct("<6sHHHI")
RECORD = struct.Struct("<BHHddBfff")
# Radii are kept as fractions rounded up to this many significant bits.
RADIUS_BITS = 64
# The disk radius: at least four Newton steps, and never below 2^-80.
SMALLEST_RADIUS = Fraction(1, 1 << 80)
# A refined centre for the decimal ray fallback: 80-digit Newton, rounded to 2^-220.
REFINED_DIGITS = 80
REFINED_BITS = 220
# Below this many records the check runs in one process (the unit tests' cores).
POOL_THRESHOLD = 100


@dataclass(frozen=True)
class Record:
    period: int
    lower: int
    upper: int
    re: float
    im: float
    digits: int
    orbit_abs: float
    center_error: float
    divisor_min_abs: float


def mobius(n: int) -> int:
    result, remaining, factor = 1, n, 2
    while factor * factor <= remaining:
        if remaining % factor == 0:
            remaining //= factor
            if remaining % factor == 0:
                return 0
            result = -result
        factor += 1
    return -result if remaining > 1 else result


def component_count(period: int) -> int:
    """Centres of exact period p: (1/2) sum over d | p of mu(p/d) 2^d (p >= 2)."""
    if period == 1:
        return 1
    total = sum(mobius(period // d) * 2**d for d in range(1, period + 1) if period % d == 0)
    return total // 2


def round_up(value: Fraction) -> Fraction:
    """An upper bound of value >= 0 with at most RADIUS_BITS significant bits."""
    if value == 0:
        return value
    shift = value.numerator.bit_length() - value.denominator.bit_length() - RADIUS_BITS
    if shift >= 0:
        return Fraction(-(-value.numerator // (value.denominator << shift)) << shift)
    return Fraction(-(-(value.numerator << -shift) // value.denominator), 1 << -shift)


def magnitude_bounds(x: int, y: int, scale: int) -> tuple[Fraction, Fraction]:
    """Lower and upper bounds of |x + iy| / 2^scale from the leading bits."""
    if x == 0 and y == 0:
        return Fraction(0), Fraction(0)
    shift = max(0, max(abs(x).bit_length(), abs(y).bit_length()) - 62)
    low_x, low_y = abs(x) >> shift, abs(y) >> shift
    lower = math.isqrt(low_x * low_x + low_y * low_y)
    upper = math.isqrt((low_x + 1) ** 2 + (low_y + 1) ** 2) + 1
    exponent = shift - scale
    if exponent >= 0:
        return Fraction(lower << exponent), Fraction(upper << exponent)
    return Fraction(lower, 1 << -exponent), Fraction(upper, 1 << -exponent)


def dyadic(value: float) -> tuple[int, int]:
    """value = m / 2^s exactly."""
    numerator, denominator = value.as_integer_ratio()
    return numerator, denominator.bit_length() - 1


@dataclass(frozen=True)
class ExactOrbit:
    """|f^n(0)| and |d/dc f^n(0)| bounds at c0 for n = 1..p, from exact arithmetic."""

    value_bounds: list[tuple[Fraction, Fraction]]
    slope_bounds: list[tuple[Fraction, Fraction]]


def exact_orbit(re: float, im: float, period: int) -> ExactOrbit:
    """The exact orbit at a binary64 point."""
    a, scale_a = dyadic(re)
    b, scale_b = dyadic(im)
    k = max(scale_a, scale_b)
    return exact_orbit_dyadic(a << (k - scale_a), b << (k - scale_b), k, period)


def exact_orbit_dyadic(c_re: int, c_im: int, k: int, period: int) -> ExactOrbit:
    """Iterates z -> z^2 + c0, z' -> 2 z z' + 1 exactly, c0 = (c_re + i c_im) / 2^k."""
    x = y = s = 0  # z = (x + iy) / 2^s
    u = v = t = 0  # z' = (u + iv) / 2^t
    values: list[tuple[Fraction, Fraction]] = []
    slopes: list[tuple[Fraction, Fraction]] = []
    for _step in range(period):
        u, v, t = 2 * (x * u - y * v) + (1 << (s + t)), 2 * (x * v + y * u), s + t
        x, y, s = x * x - y * y, 2 * x * y, 2 * s
        if s >= k:
            x, y = x + (c_re << (s - k)), y + (c_im << (s - k))
        else:
            x, y, s = (x << (k - s)) + c_re, (y << (k - s)) + c_im, k
        values.append(magnitude_bounds(x, y, s))
        slopes.append(magnitude_bounds(u, v, t))
    return ExactOrbit(values, slopes)


def disk_radii(orbit: ExactOrbit, rho: Fraction) -> list[tuple[Fraction, Fraction]]:
    """Bounds on |f^n(c) - f^n(c0)| and |f^n'(c) - f^n'(c0)| over |c - c0| <= rho.

    With e_n, e'_n those deviations: e_{n+1} <= 2|z_n| e_n + e_n^2 + rho and
    e'_{n+1} <= 2(|z_n| e'_n + |z'_n| e_n + e_n e'_n), starting from 0.
    """
    radii: list[tuple[Fraction, Fraction]] = []
    value_radius = slope_radius = Fraction(0)
    value_size = slope_size = Fraction(0)
    for (_low, value_up), (_slow, slope_up) in zip(orbit.value_bounds, orbit.slope_bounds):
        slope_radius = round_up(
            2 * (value_size * slope_radius + slope_size * value_radius + value_radius * slope_radius)
        )
        value_radius = round_up(2 * value_size * value_radius + value_radius**2 + rho)
        radii.append((value_radius, slope_radius))
        value_size, slope_size = value_up, slope_up
    return radii


@dataclass(frozen=True)
class Proof:
    rho: Fraction
    newton_step: Fraction
    orbit_abs: Fraction


def prove_root(record: Record) -> Proof:
    """Rouche at the stored binary64 centre."""
    return prove_root_at(exact_orbit(record.re, record.im, record.period), record.period)


def prove_root_at(orbit: ExactOrbit, period: int) -> Proof:
    """Rouche: on |c - c0| = rho the linear part dominates, so one simple root lies inside."""
    value_low, value_up = orbit.value_bounds[-1]
    slope_low, _slope_up = orbit.slope_bounds[-1]
    if slope_low == 0:
        raise ValueError("g'(c0) may vanish")
    newton_step = value_up / slope_low
    rho = round_up(max(4 * newton_step, SMALLEST_RADIUS))
    radii = disk_radii(orbit, rho)
    _value_radius, slope_radius = radii[-1]
    # |g'(c) - g'(c0)| <= slope_radius on the disk; Rouche needs |g(c0)| < rho (|g'(c0)| - that).
    if not (slope_radius < slope_low and value_up < rho * (slope_low - slope_radius)):
        raise ValueError("Rouche's test fails")
    for divisor in range(1, period):
        if period % divisor:
            continue
        low, _up = orbit.value_bounds[divisor - 1]
        if not low > radii[divisor - 1][0]:
            raise ValueError(f"f^{divisor}(0) may vanish in the disk")
    return Proof(rho, newton_step, value_up)


def exact_decimal(value: Fraction) -> Decimal:
    """A dyadic n / 2^k as the Decimal n 5^k / 10^k, exactly.

    A Decimal built from a string keeps every digit, whatever the context's precision.
    """
    bits = value.denominator.bit_length() - 1
    if value.denominator != 1 << bits:
        raise ValueError(f"{value} is not dyadic")
    return Decimal(f"{value.numerator * 5**bits}E-{bits}")


def refined_disk(record: Record) -> tuple[Decimal, Decimal, Decimal]:
    """A proved disk of radius below 1e-24 about the record's own root, for the decimal ray fallback.

    Newton in REFINED_DIGITS-digit decimals (any result would do) gives a dyadic
    c1 = (c_re + i c_im) / 2^REFINED_BITS. Rouche proves one simple root of exact
    period in B(c1, rho1); the exact test |c1 - c0| + rho1 <= rho puts that disk
    inside the record's own B(c0, rho), which holds only one root, so the two roots
    are the same. c1 and rho1 are returned exactly. Raises ValueError if a step fails.
    """
    own = prove_root(record)
    with localcontext() as context:
        context.prec = REFINED_DIGITS
        re, im = Decimal(record.re), Decimal(record.im)
        for _step in range(60):
            zr = zi = dr = di = Decimal(0)
            for _n in range(record.period):
                dr, di = 2 * (zr * dr - zi * di) + 1, 2 * (zr * di + zi * dr)
                zr, zi = zr * zr - zi * zi + re, 2 * zr * zi + im
            norm = dr * dr + di * di
            step_re, step_im = (zr * dr + zi * di) / norm, (zi * dr - zr * di) / norm
            re, im = re - step_re, im - step_im
            if abs(step_re) + abs(step_im) < Decimal(10) ** (12 - REFINED_DIGITS):
                break
        scale = 1 << REFINED_BITS
        c_re = int((re * scale).to_integral_value())
        c_im = int((im * scale).to_integral_value())
    proof = prove_root_at(exact_orbit_dyadic(c_re, c_im, REFINED_BITS, record.period), record.period)
    centre_re, centre_im = Fraction(c_re, 1 << REFINED_BITS), Fraction(c_im, 1 << REFINED_BITS)
    slack = own.rho - proof.rho
    gap = (centre_re - Fraction(record.re)) ** 2 + (centre_im - Fraction(record.im)) ** 2
    if not (slack > 0 and gap <= slack * slack):
        raise ValueError("the refined disk does not lie in the record's own disk")
    return exact_decimal(centre_re), exact_decimal(centre_im), exact_decimal(proof.rho)


def lavaurs_pairs(max_period: int) -> dict[int, list[tuple[int, int]]]:
    """Lavaurs' pairing of the angles of exact period p, on exact integers.

    Each angle n / (2^p - 1) is scaled to a common denominator. For p = 2, 3,
    ..., the smallest unpaired angle joins the next one whose chord crosses no
    earlier chord. The pairs are the parameter rays that land together.
    """
    common = math.lcm(*((1 << period) - 1 for period in range(1, max_period + 1)))
    chords: list[tuple[int, int]] = [(0, common)]
    pairs: dict[int, list[tuple[int, int]]] = {1: [(0, 1)]}
    for period in range(2, max_period + 1):
        modulus = (1 << period) - 1
        scale = common // modulus
        free = [n for n in range(1, modulus) if exact_ray_period(n, modulus) == period]
        found: list[tuple[int, int]] = []
        while free:
            lower = free.pop(0)
            for index, upper in enumerate(free):
                x, y = lower * scale, upper * scale
                if not any(x < u < y < v or u < x < v < y for u, v in chords):
                    chords.append((x, y))
                    found.append((lower, upper))
                    free.pop(index)
                    break
            else:
                raise ValueError(f"angle {lower}/{modulus} has no Lavaurs partner")
        pairs[period] = found
    return pairs


def exact_ray_period(numerator: int, modulus: int) -> int:
    """The period of numerator / modulus under doubling (modulus odd)."""
    angle, steps = (2 * numerator) % modulus, 1
    while angle != numerator % modulus:
        angle, steps = (2 * angle) % modulus, steps + 1
    return steps


def kneading(numerator: int, period: int) -> str:
    """The kneading sequence of numerator / (2^p - 1), in units of 1/(2(2^p - 1))."""
    modulus = (1 << period) - 1
    symbols, angle = [], numerator
    for _step in range(period):
        doubled = 2 * angle
        if doubled in (numerator, numerator + modulus):
            symbols.append("*")
        else:
            symbols.append("1" if numerator < doubled < numerator + modulus else "0")
        angle = doubled % modulus
    return "".join(symbols)


def size_estimate(re: float, im: float, period: int) -> float:
    """Heiland-Allen's component size estimate in binary64 (as src/catalog/navigation.ts).

    A check that the estimate the application computes is finite and positive, not
    part of any proof, so it may use abs() of a complex as the application uses
    Math.hypot.
    """
    c = complex(re, abs(im))
    z, l, b = 0j, 1 + 0j, 1 + 0j
    for _step in range(1, period):
        z = z * z + c
        l = 2 * z * l
        b += 1 / l
    try:
        return 1 / abs(b * l * l)
    except (ZeroDivisionError, OverflowError):
        return 0.0


def read(directory: Path) -> tuple[dict, list[Record]]:
    manifest = json.loads((directory / "core.v1.json").read_text(encoding="utf-8"))
    data = (directory / "core.v1.bin").read_bytes()
    if hashlib.sha256(data).hexdigest() != manifest["sha256"] or len(data) != manifest["byteLength"]:
        raise ValueError("core.v1.bin does not match its manifest")
    magic, version, max_period, record_bytes, count = HEADER.unpack_from(data, 0)
    if (magic, version, record_bytes) != (b"MICORE", 1, RECORD.size):
        raise ValueError("unknown core format")
    if len(data) != HEADER.size + count * RECORD.size or max_period != manifest["maxPeriod"]:
        raise ValueError("core length or maximum period disagrees with the header")
    records = [
        Record(*RECORD.unpack_from(data, HEADER.size + index * RECORD.size))
        for index in range(count)
    ]
    return manifest, records


def same_to_three_digits(stored: float, exact: Fraction) -> bool:
    if exact == 0:
        return stored == 0
    return abs(Fraction(stored) - exact) <= exact * Fraction(6, 1000)


def check_record(task: tuple[Record, bool]) -> tuple[Proof, list[str], Landing | None]:
    """The checks of one record, and, for a Lavaurs pair, the proof its rays land together."""
    record, lavaurs = task
    proof, problems = check_centre(record)
    if record.period == 1 or problems or not lavaurs:
        return proof, problems, None
    radius = math.nextafter(float(proof.rho), math.inf)
    landing = prove_rays_land_together(
        record.re, record.im, radius, record.period, record.lower, record.upper
    )
    if landing is None:
        try:
            refined = refined_disk(record)
        except ValueError:
            refined = None
        if refined is not None:
            landing = prove_rays_land_together(
                record.re, record.im, radius, record.period, record.lower, record.upper,
                refined=refined,
            )
    if landing is None:
        name = f"mi-p{record.period}-{record.lower}-{record.upper}"
        problems.append(f"{name}: its two dynamic rays were not proved to land together")
    return proof, problems, landing


def check_centre(record: Record) -> tuple[Proof, list[str]]:
    problems: list[str] = []
    name = f"mi-p{record.period}-{record.lower}-{record.upper}"
    modulus = (1 << record.period) - 1
    if record.period == 1:
        if (record.lower, record.upper) != (0, 1):
            problems.append(f"{name}: the main cardioid's rays are 0/1 and 1/1")
    else:
        if not 0 < record.lower < record.upper < modulus:
            problems.append(f"{name}: rays out of order")
        for numerator in (record.lower, record.upper):
            if exact_ray_period(numerator, modulus) != record.period:
                problems.append(f"{name}: ray {numerator}/{modulus} is not of exact period")
        if kneading(record.lower, record.period) != kneading(record.upper, record.period):
            problems.append(f"{name}: its rays have different kneading sequences")
    try:
        proof = prove_root(record)
    except ValueError as error:
        return Proof(Fraction(0), Fraction(0), Fraction(0)), [f"{name}: {error}"]
    if not same_to_three_digits(record.orbit_abs, proof.orbit_abs):
        problems.append(f"{name}: orbitAbs {record.orbit_abs} disagrees with {float(proof.orbit_abs)}")
    if not same_to_three_digits(record.center_error, proof.newton_step):
        problems.append(f"{name}: centerError {record.center_error} disagrees with {float(proof.newton_step)}")
    if record.period > 1 and not record.divisor_min_abs > 0:
        problems.append(f"{name}: no proper-divisor residual")
    size = size_estimate(record.re, record.im, record.period)
    if not (math.isfinite(size) and size > 0):
        problems.append(f"{name}: size estimate {size} is not finite and positive")
    if record.im > 0 and not 2 * record.upper < modulus:
        problems.append(f"{name}: upper half-plane centre with a ray past 1/2")
    if record.im < 0 and not 2 * record.lower > modulus:
        problems.append(f"{name}: lower half-plane centre with a ray before 1/2")
    if (record.im == 0) != (record.period == 1 or record.lower + record.upper == modulus):
        problems.append(f"{name}: real centres are exactly those with symmetric rays")
    return proof, problems


def check_collection(
    records: list[Record], proofs: list[Proof], lavaurs: dict[int, list[tuple[int, int]]]
) -> list[str]:
    problems: list[str] = []
    order = [(record.period, record.lower) for record in records]
    if order != sorted(set(order)):
        problems.append("records are not in catalog order (period, then lower ray), once each")
    by_key = {(r.period, r.lower, r.upper): r for r in records}
    for record in records:
        modulus = (1 << record.period) - 1
        key = (record.period, 0, 1) if record.period == 1 else (record.period, modulus - record.upper, modulus - record.lower)
        mirror = by_key.get(key)
        if mirror is None or (mirror.re, mirror.im) != (record.re, -record.im):
            problems.append(f"mi-p{record.period}-{record.lower}-{record.upper}: no exact conjugate")
    for period in range(1, max(r.period for r in records) + 1):
        stored = sorted((r.lower, r.upper) for r in records if r.period == period)
        if stored != sorted(lavaurs[period]):
            problems.append(f"period {period}: the ray pairs are not Lavaurs' pairs")
        disks = sorted(
            (record.re, record.im, proof.rho)
            for record, proof in zip(records, proofs)
            if record.period == period
        )
        # Sorted by real part: once a disk is further right than rho plus the largest
        # radius, it and every later one are too far to meet.
        largest = max((rho for _re, _im, rho in disks), default=Fraction(0))
        for index, (re, im, rho) in enumerate(disks):
            for other_re, other_im, other_rho in disks[index + 1 :]:
                if Fraction(other_re) - Fraction(re) > rho + largest:
                    break
                gap = (Fraction(other_re) - Fraction(re)) ** 2 + (Fraction(other_im) - Fraction(im)) ** 2
                if gap <= (rho + other_rho) ** 2:
                    problems.append(f"period {period}: two disks meet at {re}{im:+}i")
    real = sorted(
        ((record.re, Fraction(record.lower, (1 << record.period) - 1)) for record in records if record.im == 0),
        reverse=True,
    )
    if [angle for _re, angle in real] != sorted(angle for _re, angle in real) or len({a for _r, a in real}) != len(real):
        problems.append("along the real axis the lower angle must grow as Re c decreases")
    return problems


def check_all(
    records: list[Record], lavaurs: dict[int, list[tuple[int, int]]], workers: int
) -> list[tuple[Proof, list[str], Landing | None]]:
    pairs = {(period, lower, upper) for period, found in lavaurs.items() for lower, upper in found}
    tasks = [(record, (record.period, record.lower, record.upper) in pairs) for record in records]
    if workers <= 1 or len(records) < POOL_THRESHOLD:
        return [check_record(task) for task in tasks]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(check_record, tasks, chunksize=16))


def main(argv: list[str]) -> int:
    arguments = [argument for argument in argv[1:] if not argument.startswith("--workers=")]
    workers = next(
        (int(a.split("=", 1)[1]) for a in argv[1:] if a.startswith("--workers=")),
        os.cpu_count() or 1,
    )
    directory = Path(arguments[0] if arguments else "catalog")
    manifest, records = read(directory)
    max_period = manifest["maxPeriod"]
    expected = [component_count(period) for period in range(1, max_period + 1)]
    problems: list[str] = []
    if expected != list(A000740[:max_period]):
        problems.append("the Mobius count disagrees with OEIS A000740")
    counts = [sum(1 for r in records if r.period == period) for period in range(1, max_period + 1)]
    if counts != expected or manifest["countsByPeriod"] != expected:
        problems.append(f"counts per period {counts} differ from {expected}")
    proofs: list[Proof] = []
    landings: list[Landing] = []
    lavaurs = lavaurs_pairs(max_period)
    for proof, record_problems, landing in check_all(records, lavaurs, workers):
        proofs.append(proof)
        problems.extend(record_problems)
        if landing is not None:
            landings.append(landing)
    problems.extend(check_collection(records, proofs, lavaurs))
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        print(f"cross-check FAILED: {len(problems)} problems", file=sys.stderr)
        return 1
    worst_step = max(float(proof.newton_step) for proof in proofs)
    worst_orbit = max(float(proof.orbit_abs) for proof in proofs)
    least_divisor = min(r.divisor_min_abs for r in records if r.period > 1)
    print(
        f"cross-checked {len(records)} centres through period {max_period}: counts match A000740; "
        f"each stored centre is within {worst_step:.3g} of a proved simple root of exact period "
        f"(largest |f_c^p(0)| {worst_orbit:.3g}, smallest proper-divisor |f_c^d(0)| {least_divisor:.3g}); "
        f"the rays of all {len(landings)} pairs are Lavaurs' and, for c in each centre's disk, "
        f"land together at a repelling periodic point of f_c "
        f"(at most {max(landing.steps for landing in landings)} pull-backs, "
        f"{sum(landing.decimal for landing in landings)} in 40-digit decimals)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
