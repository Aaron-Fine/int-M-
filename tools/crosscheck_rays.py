"""Proves that a centre's two characteristic dynamic rays land at one point (ADR 0014).

For a parameter c (any point of a small disk C, which holds the true centre)
and the rays of angles a/M and b/M, M = 2^p - 1, of f_c(z) = z^2 + c, this
module encloses each ray in a chain of disks and proves both land at the
same repelling periodic point:

1. Far out, |w| in [20, 400], the Bottcher map is within relative
   exp(eta) - 1 of the identity (eta = |c| / |z|^2 / (1 - |c| / |z|^2)), so
   disks about the straight ray enclose R_c(theta) on that fundamental
   domain of potential, for every angle of the rays' doubling cycles.
2. Pulling a chain back by z = +-sqrt(w - c) encloses the next fundamental
   domain of the ray of half the angle; the sign is the one whose image
   meets the disk already known at the junction, and exactly one may.
3. Once one period of potential of both rays lies in a disk D on which
   every w in D has exactly one solution of f^p(z) = w in D (the Krawczyk
   test, with the target w ranging over D), the inverse branch maps D into
   a compact part of itself, so its iterates carry both rays to its unique
   fixed point: they land together.

Arithmetic is ball arithmetic in binary64, every rounding bounded by the
operands' magnitudes, and it uses only operations IEEE-754 rounds correctly
(+, -, *, /, and math.sqrt, the hardware square root) and exact ones (abs of
a real, frexp, ldexp): magnitudes are sqrt(x^2 + y^2) and square roots the
real formulas, never the C library's hypot or cmath. Each complex operation
gets an allowance of 8 units of 4.5e-16 relative to its operands, and every
radius is inflated by 2e-15 relative. The rays' directions come from decimal
Taylor series with a bounded remainder. A 40-digit decimal fallback, where
every operation is correctly rounded, serves where binary64 cannot resolve the
landing point.
By the Douady-Hubbard-Milnor wake theorem the two rays land together only
for c in the closed wake of the pair; tools/crosscheck_catalog_core.py turns
that into the association of every pair with its centre.

It shares no code with the generator. GPL-3.0-only.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, localcontext
from functools import lru_cache
import math

# Far-out radii of the starting fundamental domain, and the chain's radius ratio.
START_RADIUS = 20.0
START_RATIO = 1.06
# Pull-back steps before giving up: binary64 needs at most 62 p on the catalog, and
# the one decimal case (the period-12 component nearest -2) 8 p.
FLOAT_STEPS_PER_PERIOD = 90
DECIMAL_STEPS_PER_PERIOD = 16
DECIMAL_DIGITS = 40


@dataclass(frozen=True)
class Landing:
    """Both rays enter, and stay in, the disk B(centre, radius), landing at its fixed point."""

    steps: int
    centre: complex
    radius: float
    decimal: bool


def doubling_cycle(numerator: int, modulus: int) -> list[int]:
    cycle, angle = [], numerator
    while True:
        cycle.append(angle)
        angle = (2 * angle) % modulus
        if angle == numerator:
            return cycle


def float_size(value: complex) -> float:
    """|value| as sqrt(x^2 + y^2): within 3 units of 2^-53, from IEEE operations only.

    Scaling by an exact power of two keeps the squares clear of overflow and underflow.
    """
    x, y = abs(value.real), abs(value.imag)
    big = x if x > y else y
    if big == 0:
        return 0.0
    if 1e-150 < big < 1e150:
        return math.sqrt(x * x + y * y)
    exponent = math.frexp(big)[1]
    x, y = math.ldexp(x, -exponent), math.ldexp(y, -exponent)
    return math.ldexp(math.sqrt(x * x + y * y), exponent)


def float_sqrt(value: complex) -> complex:
    """The principal square root by the real formulas: within a few units of 2^-53.

    Both branches add quantities of one sign, so nothing cancels.
    """
    x, y = value.real, value.imag
    modulus = float_size(value)
    if x >= 0:
        root = math.sqrt((modulus + x) / 2)
        return complex(root, y / (2 * root)) if root else 0j
    root = math.sqrt((modulus - x) / 2)
    return complex(abs(y) / (2 * root), math.copysign(root, y))


def _decimal_pi() -> Decimal:
    """pi by Machin's formula, 16 atan(1/5) - 4 atan(1/239), to 50 digits."""

    def arctan_inverse(k: int) -> Decimal:
        total, power, n = Decimal(0), Decimal(1) / k, 0
        while power > Decimal(10) ** -55:
            total += (-1) ** n * power / (2 * n + 1)
            power /= k * k
            n += 1
        return total  # alternating series: the error is below the first omitted term

    with localcontext() as context:
        context.prec = 60
        return 16 * arctan_inverse(5) - 4 * arctan_inverse(239)


PI = _decimal_pi()


@lru_cache(maxsize=None)
def unit_direction(numerator: int, modulus: int) -> complex:
    """exp(2 pi i numerator / modulus), each part within 0.6 units of 2^-53.

    Decimal Taylor series at 50 digits after reducing the angle to [-pi, pi]; the
    remainder and the rounding are below 1e-40, and float() of a Decimal is
    correctly rounded.
    """
    with localcontext() as context:
        context.prec = 50
        fraction = Decimal(numerator) / modulus
        if fraction > Decimal("0.5"):
            fraction -= 1
        x = 2 * PI * fraction
        cos, sin, term, k = Decimal(0), Decimal(0), Decimal(1), 0
        while True:
            if k % 4 == 0:
                cos += term
            elif k % 4 == 1:
                sin += term
            elif k % 4 == 2:
                cos -= term
            else:
                sin -= term
            k += 1
            term = term * abs(x) / k
            # |x| <= pi: once k > 30 each term shrinks tenfold, so the tail is below 2 terms.
            if k > 30 and term < Decimal(10) ** -45:
                break
        if x < 0:
            sin = -sin
        return complex(float(cos), float(sin))


class FloatBalls:
    """Disks (centre, radius) in binary64 with outward rounding."""

    def __init__(self) -> None:
        self.unit = 4.5e-16  # bounds one complex operation's error, relative to |operands|
        self.inflate = 1 + 2e-15

    def number(self, value: complex) -> complex:
        return complex(value)

    def real(self, value: float) -> float:
        return float(value)

    def up(self, value: float) -> float:
        return value * self.inflate + 1e-300

    size = staticmethod(float_size)
    sqrt = staticmethod(float_sqrt)
    rsqrt = staticmethod(math.sqrt)


class DecimalComplex:
    __slots__ = ("re", "im")

    def __init__(self, re: Decimal | int | float, im: Decimal | int | float = 0) -> None:
        self.re = Decimal(re)
        self.im = Decimal(im)

    @staticmethod
    def of(value: object) -> "DecimalComplex":
        if isinstance(value, DecimalComplex):
            return value
        if isinstance(value, complex):
            return DecimalComplex(value.real, value.imag)
        return DecimalComplex(value)  # type: ignore[arg-type]

    def __add__(self, other: object) -> "DecimalComplex":
        o = DecimalComplex.of(other)
        return DecimalComplex(self.re + o.re, self.im + o.im)

    __radd__ = __add__

    def __sub__(self, other: object) -> "DecimalComplex":
        o = DecimalComplex.of(other)
        return DecimalComplex(self.re - o.re, self.im - o.im)

    def __rsub__(self, other: object) -> "DecimalComplex":
        return DecimalComplex.of(other) - self

    def __neg__(self) -> "DecimalComplex":
        return DecimalComplex(-self.re, -self.im)

    def __mul__(self, other: object) -> "DecimalComplex":
        o = DecimalComplex.of(other)
        return DecimalComplex(self.re * o.re - self.im * o.im, self.re * o.im + self.im * o.re)

    __rmul__ = __mul__

    def __truediv__(self, other: object) -> "DecimalComplex":
        o = DecimalComplex.of(other)
        norm = o.re * o.re + o.im * o.im
        return DecimalComplex(
            (self.re * o.re + self.im * o.im) / norm, (self.im * o.re - self.re * o.im) / norm
        )

    def __rtruediv__(self, other: object) -> "DecimalComplex":
        return DecimalComplex.of(other) / self

    def __abs__(self) -> Decimal:
        return (self.re * self.re + self.im * self.im).sqrt()


class DecimalBalls:
    """Disks in DECIMAL_DIGITS-digit decimals with outward rounding."""

    def __init__(self) -> None:
        self.unit = Decimal(10) ** (3 - DECIMAL_DIGITS)
        self.inflate = 1 + Decimal(10) ** (5 - DECIMAL_DIGITS)

    def number(self, value: object) -> DecimalComplex:
        return DecimalComplex.of(value)

    def real(self, value: object) -> Decimal:
        return Decimal(value)  # type: ignore[arg-type]

    def up(self, value: Decimal) -> Decimal:
        return value * self.inflate + Decimal(10) ** -300

    def size(self, value: DecimalComplex) -> Decimal:
        return abs(value)

    def sqrt(self, value: DecimalComplex) -> DecimalComplex:
        modulus = abs(value)
        re = ((modulus + value.re) / 2).sqrt()
        im = ((modulus - value.re) / 2).sqrt()
        return DecimalComplex(re, im if value.im >= 0 else -im)

    def rsqrt(self, value: Decimal) -> Decimal:
        return value.sqrt()


def start_chain(numerator: int, modulus: int, c_size: float, arith, scale) -> list:  # type: ignore[no-untyped-def]
    """Disks covering R_c(numerator / modulus) for |w| in [START_RADIUS, START_RADIUS^2], outer first."""
    chain = []
    outer = START_RADIUS * START_RADIUS
    direction = unit_direction(numerator, modulus)
    while outer > START_RADIUS * (1 + 1e-9):
        inner = max(START_RADIUS, outer / START_RATIO)
        smallest = inner * 0.99  # |z| >= |w| exp(-eta) >= 0.99 |w|
        ratio = c_size / smallest**2
        eta = ratio / (1 - ratio)
        middle = (outer + inner) / 2
        # Bottcher: z = w exp(-d), |d| <= eta, and exp(eta) - 1 <= eta (1 + eta) for
        # eta <= 1; 1.01 and 1e-12 absorb this line's rounding and the direction's error.
        radius = (outer - inner) / 2 + outer * eta * (1 + eta) * 1.01 + outer * 1e-12
        chain.append((arith.number(middle * direction), arith.real(radius) * scale))
        outer = inner
    return chain


def pull_back(chain: list, junction: tuple, c, c_radius, arith) -> list | None:  # type: ignore[no-untyped-def]
    """Encloses the preimage branch of the chain that continues from the junction disk."""
    result, last = [], junction
    for centre, radius in chain:
        u = centre - c
        size = arith.size(u)
        spread = radius + c_radius + (arith.size(centre) + arith.size(c)) * arith.unit
        if spread >= size * arith.real("0.9"):
            return None
        root = arith.sqrt(u)
        root_radius = arith.up(
            spread / (arith.rsqrt(size) * (1 + arith.rsqrt(1 - spread / size)))
            + arith.size(root) * 8 * arith.unit
        )
        meets = [
            arith.size(sign * root - last[0]) <= arith.up(root_radius + last[1]) for sign in (1, -1)
        ]
        if meets[0] == meets[1]:
            return None
        image = root if meets[0] else -root
        result.append((image, root_radius))
        last = (image, root_radius)
    return result


def pull_back_float(chain: list, junction: tuple, c, c_radius, arith) -> list | None:  # type: ignore[no-untyped-def]
    """pull_back for FloatBalls, inlined: the same bounds, about twice as fast.

    Every magnitude here is sqrt(x^2 + y^2). Nothing overflows: |w| <= 401. If
    |w - c| were so small that its squares underflowed, its size would come out too
    small and the disk would be refused (spread >= 0.9 size), which only stops the
    proof. A centre difference in the junction test that underflows is below 1e-154,
    far inside any disk radius, so the disks truly meet.
    """
    sqrt, unit, inflate = math.sqrt, arith.unit, arith.inflate
    cx, cy = c.real, c.imag
    c_size = sqrt(cx * cx + cy * cy)
    result: list = []
    last, last_radius = junction
    lx, ly = last.real, last.imag
    for centre, radius in chain:
        wx, wy = centre.real, centre.imag
        ux, uy = wx - cx, wy - cy
        size = sqrt(ux * ux + uy * uy)
        spread = radius + c_radius + (sqrt(wx * wx + wy * wy) + c_size) * unit
        if spread >= size * 0.9:
            return None
        if ux >= 0:
            half = sqrt((size + ux) / 2)
            rx, ry = half, uy / (2 * half)
        else:
            half = sqrt((size - ux) / 2)
            rx, ry = abs(uy) / (2 * half), math.copysign(half, uy)
        root_size = sqrt(rx * rx + ry * ry)
        root_radius = (
            spread / (sqrt(size) * (1 + sqrt(1 - spread / size))) + root_size * 8 * unit
        ) * inflate + 1e-300
        bound = (root_radius + last_radius) * inflate + 1e-300
        px, py, mx, my = rx - lx, ry - ly, -rx - lx, -ry - ly
        plus = sqrt(px * px + py * py) <= bound
        minus = sqrt(mx * mx + my * my) <= bound
        if plus == minus:
            return None
        if minus:
            rx, ry = -rx, -ry
        lx, ly, last_radius = rx, ry, root_radius
        result.append((complex(rx, ry), root_radius))
    return result


def orbit_ball(z, z_radius, c, c_radius, steps: int, arith):  # type: ignore[no-untyped-def]
    """Enclosures of f^steps and its z-derivative over B(z, z_radius), c in B(c, c_radius)."""
    value, value_radius = z, z_radius
    slope, slope_radius = arith.number(1), arith.real(0)
    for _step in range(steps):
        size, slope_size = arith.size(value), arith.size(slope)
        new_slope = 2 * value * slope
        slope_radius = arith.up(
            2 * (size * slope_radius + slope_size * value_radius + value_radius * slope_radius)
            + 8 * size * slope_size * arith.unit
        )
        slope = new_slope
        new_value = value * value + c
        value_radius = arith.up(
            2 * size * value_radius + value_radius * value_radius + c_radius
            + 8 * (size * size + arith.size(c)) * arith.unit
        )
        value = new_value
    return value, value_radius, slope, slope_radius


def maps_into_itself(centre, radius, c, c_radius, period: int, arith) -> bool:  # type: ignore[no-untyped-def]
    """Krawczyk with the target ranging over D: every w in D has one f^p-preimage in D."""
    value, value_radius, _slope, _ = orbit_ball(centre, 0 * radius, c, c_radius, period, arith)
    _value, _, slope, slope_radius = orbit_ball(centre, radius, c, c_radius, period, arith)
    inverse = 1 / slope
    size = arith.size(inverse)
    gap = arith.size(value - centre) + (arith.size(value) + arith.size(centre)) * arith.unit
    shift = arith.up(size * arith.up(gap + value_radius + radius))
    contraction = arith.up(arith.size(1 - inverse * slope) + 8 * arith.unit + size * slope_radius)
    return contraction < 1 and arith.up(shift + contraction * radius) < radius


def landing_estimate(end, c, period: int, pieces: list, arith):  # type: ignore[no-untyped-def]
    """The repelling periodic point near the rays' ends, by Newton; the ends if Newton strays.

    Any centre is sound: this one only makes the disk small enough to pass.
    """
    z = end
    for _step in range(50):
        value, slope = z, arith.number(1)
        for _n in range(period):
            slope = 2 * value * slope
            value = value * value + c
        if abs(slope - 1) == 0:
            return end
        z = z - (value - z) / (slope - 1)
    spread = max(abs(disk[0] - end) + disk[1] for disk in pieces)
    return z if abs(z - end) <= 10 * spread and abs(slope) > 1 else end


def prove_landing(c, c_radius, period: int, lower: int, upper: int, arith, max_steps: int):  # type: ignore[no-untyped-def]
    """Landing or None: both rays pulled back until one disk certifies their common end."""
    modulus = (1 << period) - 1
    first = doubling_cycle(lower, modulus)
    cycles = [first] if upper in first else [first, doubling_cycle(upper, modulus)]
    c_size = float(arith.size(c)) * 1.000001 + float(c_radius)
    scale = arith.real("1.000001")
    chains = {
        angle: start_chain(angle, modulus, c_size, arith, scale) for cycle in cycles for angle in cycle
    }
    history: dict[int, list] = {lower: [], upper: []}
    pull = pull_back_float if isinstance(arith, FloatBalls) else pull_back
    for step in range(1, max_steps + 1):
        pulled = {}
        for angle, chain in chains.items():
            image = pull(chains[(2 * angle) % modulus], chain[-1], c, c_radius, arith)
            if image is None:
                return None
            pulled[angle] = image
        chains = pulled
        for angle in (lower, upper):
            history[angle] = (history[angle] + [chains[angle]])[-period:]
        if step % period or step < period:
            continue
        # One period of potential of each ray: the pieces from the last p pull-backs.
        pieces = [disk for angle in (lower, upper) for chain in history[angle] for disk in chain]
        centre = landing_estimate(chains[lower][-1][0], c, period, pieces, arith)
        far = max(arith.size(disk[0] - centre) + disk[1] for disk in pieces)
        radius = arith.up(far * arith.real("1.5"))
        if maps_into_itself(centre, radius, c, c_radius, period, arith):
            return step, centre, radius
    return None


def prove_rays_land_together(
    re: float, im: float, c_radius: float, period: int, lower: int, upper: int,
    refined: tuple[Decimal, Decimal, Decimal] | None = None,
) -> Landing | None:
    """Binary64 first; with `refined` (re, im, radius of a proved disk about the centre),
    the decimal fallback."""
    found = prove_landing(
        complex(re, im), c_radius, period, lower, upper, FloatBalls(),
        FLOAT_STEPS_PER_PERIOD * period,
    )
    if found is not None:
        step, centre, radius = found
        return Landing(step, complex(centre), float(radius), False)
    if refined is None:
        return None
    with localcontext() as context:
        context.prec = DECIMAL_DIGITS
        arith = DecimalBalls()
        found = prove_landing(
            DecimalComplex(refined[0], refined[1]), refined[2], period, lower, upper, arith,
            DECIMAL_STEPS_PER_PERIOD * period,
        )
        if found is None:
            return None
        step, centre, radius = found
        return Landing(step, complex(float(centre.re), float(centre.im)), float(radius), True)
