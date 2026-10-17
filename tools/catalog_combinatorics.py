"""Exact combinatorics of hyperbolic components for the catalog generator.

Every angle is an exact rational. A characteristic angle of a period-p
component is stored as its numerator over 2**p - 1, so the pair (p, numerator)
names it exactly. The main cardioid's root angle is 0; following Lavaurs it is
treated as the pair (0/1, 1/1).

References: P. Lavaurs, "Une description combinatoire de l'involution definie
par M sur les rationnels a denominateur impair" (1986), for the ray pairing;
D. Schleicher, "Internal addresses of the Mandelbrot set and Galois groups of
polynomials" (Arnold Math. J. 2017), for kneading sequences, internal
addresses and the denominators of angled internal addresses.

This module is application source code, licensed under GPL-3.0-only.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
import cmath
import math

RayPair = tuple[int, int]


@dataclass(frozen=True)
class AngledStep:
    from_period: int
    to_period: int
    numerator: int
    denominator: int


def ray_modulus(period: int) -> int:
    """2**period - 1: the denominator of every characteristic angle of that period."""
    return (1 << period) - 1


def has_exact_ray_period(numerator: int, period: int) -> bool:
    """True when numerator / (2**period - 1) has exact period `period` under doubling."""
    modulus = ray_modulus(period)
    return all(
        (numerator * ray_modulus(divisor)) % modulus != 0
        for divisor in range(1, period)
        if period % divisor == 0
    )


def _arcs_cross(left: tuple[Fraction, Fraction], right: tuple[Fraction, Fraction]) -> bool:
    (a, b), (c, d) = left, right
    return a < c < b < d or c < a < d < b


def lavaurs_pairs(max_period: int) -> dict[int, list[RayPair]]:
    """Characteristic ray pairs per period, as numerators over 2**p - 1.

    Lavaurs' algorithm: for p = 2, 3, ..., join each unpaired angle of exact
    period p, smallest first, to the next unpaired one whose chord crosses no
    earlier chord. The pairs are listed by increasing lower angle.
    """
    if max_period < 1:
        raise ValueError("max_period must be at least 1")
    chords: list[tuple[Fraction, Fraction]] = [(Fraction(0), Fraction(1))]
    pairs: dict[int, list[RayPair]] = {1: [(0, 1)]}
    for period in range(2, max_period + 1):
        modulus = ray_modulus(period)
        free = [n for n in range(1, modulus) if has_exact_ray_period(n, period)]
        period_pairs: list[RayPair] = []
        while free:
            lower = free.pop(0)
            for index, upper in enumerate(free):
                chord = (Fraction(lower, modulus), Fraction(upper, modulus))
                if not any(_arcs_cross(chord, earlier) for earlier in chords):
                    chords.append(chord)
                    period_pairs.append((lower, upper))
                    free.pop(index)
                    break
            else:
                raise RuntimeError(f"angle {lower}/{modulus} has no Lavaurs partner")
        pairs[period] = period_pairs
    return pairs


def kneading_sequence(numerator: int, period: int) -> str:
    """nu_1 ... nu_p of theta = numerator / (2**p - 1), as '0', '1' and '*'.

    nu_k is 1 when 2**(k-1) theta lies in (theta/2, (theta+1)/2), 0 when it
    lies outside, and * on either boundary. Units of 1/(2(2**p - 1)) keep it exact.
    """
    modulus = ray_modulus(period)
    lower, upper = numerator, numerator + modulus
    symbols: list[str] = []
    angle = numerator
    for _index in range(period):
        doubled = 2 * angle
        if doubled in (lower, upper):
            symbols.append("*")
        elif lower < doubled < upper:
            symbols.append("1")
        else:
            symbols.append("0")
        angle = doubled % modulus
    return "".join(symbols)


def _rho_function(kneading: str) -> Callable[[int], int]:
    period = len(kneading)

    def symbol(index: int) -> str:
        return kneading[(index - 1) % period]

    def rho(start: int) -> int:
        candidate = start + 1
        while candidate < period and symbol(candidate) == symbol(candidate - start):
            candidate += 1
        return candidate

    return rho


def internal_address(numerator: int, period: int) -> list[int]:
    """Internal address 1 -> S_1 -> ... -> period, from the kneading sequence."""
    if period == 1:
        return [1]
    rho = _rho_function(kneading_sequence(numerator, period))
    address = [1]
    while address[-1] < period:
        address.append(rho(address[-1]))
    return address


def angled_denominator(numerator: int, period: int, step_from: int, step_to: int) -> int:
    """Schleicher's denominator q_k of the angle at S_k = step_from.

    With r in {1, ..., S_k} congruent to S_{k+1} mod S_k:
    q_k = (S_{k+1} - r) / S_k + 1 if S_k is in the rho-orbit of r, else + 2.
    """
    rho = _rho_function(kneading_sequence(numerator, period))
    remainder = step_to % step_from or step_from
    orbit = {remainder}
    current = remainder
    while current < period:
        current = rho(current)
        orbit.add(current)
    offset = 1 if step_from in orbit else 2
    return (step_to - remainder) // step_from + offset


def bulb_pair(numerator: int, denominator: int) -> RayPair:
    """Characteristic pair of the numerator/denominator bulb of the main cardioid.

    Its angles form the doubling cycle of rotation number numerator/denominator;
    the pair is the two cycle points bounding the shortest gap.
    """
    modulus = ray_modulus(denominator)
    for start in range(1, modulus):
        orbit = [(start << shift) % modulus for shift in range(denominator)]
        if len(set(orbit)) != denominator:
            continue
        ordered = sorted(orbit)
        rotation = (ordered.index(orbit[1]) - ordered.index(orbit[0])) % denominator
        if rotation != numerator:
            continue
        gaps = [
            ((ordered[(index + 1) % denominator] - ordered[index]) % modulus, index)
            for index in range(denominator)
        ]
        _gap, index = min(gaps)
        return ordered[index], ordered[(index + 1) % denominator]
    raise ValueError(f"no bulb with rotation number {numerator}/{denominator}")


def tune_angle(inner: int, inner_period: int, outer: RayPair, outer_period: int) -> int:
    """Douady-Hubbard tuning: replace each binary digit 0/1 of `inner` by `outer`'s blocks."""
    lower, upper = outer
    tuned = 0
    for digit in format(inner, f"0{inner_period}b"):
        tuned = (tuned << outer_period) | (upper if digit == "1" else lower)
    return tuned


def _in_closed_wake(angle: Fraction, pair: RayPair, period: int) -> bool:
    modulus = ray_modulus(period)
    return Fraction(pair[0], modulus) <= angle <= Fraction(pair[1], modulus)


def angled_internal_address(
    numerator: int,
    period: int,
    pairs: dict[int, list[RayPair]],
) -> list[AngledStep]:
    """Angled internal address of the period-p component whose lower angle is given.

    Denominators follow Schleicher's formula. Each numerator is the internal
    angle of the sub-wake of component S_k that contains theta: the wake of
    the tuned numerator/denominator bulb, found by search. `pairs` must hold
    every period up to `period` (lavaurs_pairs).
    """
    address = internal_address(numerator, period)
    theta = Fraction(numerator, ray_modulus(period))
    component: RayPair = (0, 1)
    steps: list[AngledStep] = []
    for step_from, step_to in zip(address, address[1:]):
        denominator = angled_denominator(numerator, period, step_from, step_to)
        found = None
        for candidate in range(1, denominator):
            if math.gcd(candidate, denominator) != 1:
                continue
            bulb = bulb_pair(candidate, denominator)
            satellite = (
                tune_angle(bulb[0], denominator, component, step_from),
                tune_angle(bulb[1], denominator, component, step_from),
            )
            if _in_closed_wake(theta, satellite, denominator * step_from):
                found = candidate
                break
        if found is None:
            raise RuntimeError(
                f"no sub-wake of period {step_from} contains {numerator}/{ray_modulus(period)}"
            )
        steps.append(AngledStep(step_from, step_to, found, denominator))
        # Wakes of equal period can nest (6/15-9/15 holds 7/15-8/15): take the innermost.
        component = max(
            (pair for pair in pairs[step_to] if _in_closed_wake(theta, pair, step_to)),
            key=lambda pair: pair[0],
        )
    return steps


def trace_ray_inward(numerator: int, period: int, depth: int) -> complex:
    """Binary64 point on the parameter ray of angle numerator / (2**p - 1).

    Follows the ray from potential radius 65536 inward by Newton steps on
    f_c^k(0) = r e^{2 pi i 2^(k-1) theta}, eight radii per iteration depth.
    Used only to match a ray pair to a centre; the centre itself is refined
    separately.
    """
    radius = 65536.0
    sharpness = 8
    modulus = ray_modulus(period)
    parameter = cmath.rect(radius, 2 * math.pi * numerator / modulus)
    angle = numerator
    for depth_index in range(1, depth + 1):
        for sub_step in range(sharpness):
            target = cmath.rect(
                radius ** (0.5 ** ((sub_step + 1) / sharpness)),
                2 * math.pi * angle / modulus,
            )
            for _newton in range(64):
                value = 0j
                derivative = 0j
                for _iteration in range(depth_index):
                    derivative = 2 * value * derivative + 1
                    value = value * value + parameter
                update = (value - target) / derivative
                parameter -= update
                if abs(update) < 1e-15 * (1 + abs(parameter)):
                    break
        angle = (2 * angle) % modulus
    return parameter


def nucleus_newton(seed: complex, period: int) -> complex:
    """Binary64 Newton iteration for f_c^period(0) = 0 from `seed`."""
    parameter = seed
    for _iteration in range(200):
        value = 0j
        derivative = 0j
        for _step in range(period):
            derivative = 2 * value * derivative + 1
            value = value * value + parameter
        update = value / derivative
        parameter -= update
        if abs(update) < 1e-15:
            break
    return parameter


def landing_center(numerator: int, period: int) -> complex:
    """Approximate centre of the component whose root the ray lands on."""
    if period == 1:
        return 0j
    return nucleus_newton(trace_ray_inward(numerator, period, 4 * period), period)
