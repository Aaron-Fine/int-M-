"""Proves that a centre's two characteristic dynamic rays land at one point (ADR 0014).

For every parameter c of a small disk C, which holds the true centre c*, and
the rays of angles a/M and b/M, M = 2^p - 1, of f_c(z) = z^2 + c, this module
encloses each ray in a chain of disks and proves both land at the same
repelling periodic point. The enclosures hold for every c in C; the theorems
are applied at c = c*, which lies in the Mandelbrot set M.

1. Far out, |w| in [20, 400], the Bottcher map is within relative
   exp(eta) - 1 of the identity (eta = |c| / |z|^2 / (1 - |c| / |z|^2)), so
   disks about the straight ray enclose R_c(theta) on that fundamental
   domain of potential, for every angle of the rays' doubling cycles
   (start_chain).
2. Pulling a chain back by z = +-sqrt(w - c) encloses the next fundamental
   domain of the ray of half the angle; the sign is the one whose image
   meets the disk already known at the junction, and exactly one may
   (pull_back).
3. Once one period of potential of both rays lies in a disk D on which
   every w in D has exactly one solution of f^p(z) = w in D (the Krawczyk
   test, with the target w ranging over D), the inverse branch maps D into
   a compact part of itself, so its iterates carry both rays to its unique
   fixed point: they land together (maps_into_itself, prove_landing).

Arithmetic is ball arithmetic in binary64, every rounding bounded by the
operands' magnitudes, and it uses only operations IEEE-754 rounds correctly
(+, -, *, /, and math.sqrt, the hardware square root) and exact ones (abs of
a real, frexp, ldexp): magnitudes are sqrt(x^2 + y^2) and square roots the
real formulas, never the C library's hypot or cmath. Each complex operation
gets an allowance of 8 units of 4.5e-16 relative to its operands, and every
radius is inflated by 2e-15 relative. The rays' directions come from decimal
Taylor series with a bounded remainder. A 40-digit decimal fallback, with the
same bounds and correctly rounded operations (an allowance of 8 units of 1e-37,
an inflation of 1e-35), serves where binary64 cannot resolve the landing point.

Trust base. The proof relies on these and nothing else:
- IEEE-754 binary64 with round-to-nearest, where only +, -, *, /, math.sqrt and
  exact operations enter a bound; Python's integers and decimal module (each
  operation correctly rounded to the context's precision); math.nextafter is
  exact, and float() of a Fraction or Decimal is correctly rounded (faithful
  rounding would suffice where it is used).
- Bottcher's theorem: for c in M, phi_c is a conformal isomorphism from the
  complement of K_c onto the complement of the closed unit disk, tangent to the
  identity at infinity, with phi_c(f_c(z)) = phi_c(z)^2 and the product formula
  phi_c(z) = z prod_n (1 + c / z_n^2)^(1 / 2^(n+1)); the dynamic ray R_c(theta)
  is the preimage of the straight ray of angle theta, and f_c maps R_c(theta)
  onto R_c(2 theta), doubling the potential (Douady and Hubbard; Milnor,
  Dynamics in One Complex Variable, the treatment of Bottcher's theorem).
- |c| <= 2 for c in M, checked as |c| <= BOTTCHER_C_BOUND = 2.01 on the disk.
- The maximum principle for the subharmonic Green's function log|phi_c|.
- The Schwarz-Pick lemma (or the Earle-Hamilton theorem) for the landing step.
- Banach's fixed-point theorem and the mean-value inequality for holomorphic
  maps on a convex set, for the Krawczyk test.
- Proved here, as elementary lemmas: the Bottcher estimate and |z| >= 0.99 |w|
  for |c| <= 2.01, |w| >= 20 (start_chain); the square-root perturbation bound
  and the branch choice (pull_back); the Krawczyk-with-target lemma
  (maps_into_itself); the landing lemma (prove_landing); the rounding of the
  magnitudes, square roots and directions (float_size, float_sqrt,
  DecimalBalls.sqrt, unit_direction).
- In tools/crosscheck_catalog_core.py: the wake theorem (Douady and Hubbard;
  Milnor 2000, Theorem 1.2), under which the two rays land together only for c
  in the closed wake of the pair, and the facts that turn that into the
  association of every pair with its centre, among them the step from the
  closed wake to the open wake: the centre lies in M, so it is on no parameter
  ray (Douady and Hubbard (c)), and it is not the parabolic root (Douady and
  Hubbard (d)).

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
# start_chain's |z| >= 0.99 |w| is proved for |c| up to this bound; every centre has |c| <= 2.
BOTTCHER_C_BOUND = 2.01


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
        """The principal square root by float_sqrt's cancellation-free formulas.

        With v = x + iy, |v| = m, t = sqrt((m + |x|) / 2) and s = |y| / (2t), one has
        t^2 - s^2 = |x| and 2ts = |y| (as (m + |x|)^2 - y^2 = 2|x|(m + |x|)), so
        t + is is the root of |x| + i|y|, and signs and order give the root of v.
        Every decimal operation is correctly rounded, within e = 5e-40 relative: m
        comes out within 2.01e (two squares, a sum, a root), m + |x| adds two
        non-negative terms (3.02e), / 2 and the root give t within 3.02e, and 2t and
        the division give s within 5.04e. Each part is within 5.04e of itself, so the
        root is within 5.04e |root|, far inside the 8 unit = 1600e |root| that pull_back
        allows. No term cancels, however nearly real v is.
        """
        modulus = abs(value)
        large = ((modulus + abs(value.re)) / 2).sqrt()
        if large == 0:
            return DecimalComplex(0)
        small = abs(value.im) / (2 * large)
        if value.re >= 0:
            return DecimalComplex(large, small if value.im >= 0 else -small)
        return DecimalComplex(small, large if value.im >= 0 else -large)

    def rsqrt(self, value: Decimal) -> Decimal:
        return value.sqrt()


def start_chain(numerator: int, modulus: int, c_size: float, arith, scale) -> list:  # type: ignore[no-untyped-def]
    """Disks covering R_c(numerator / modulus) for |w| in [START_RADIUS, START_RADIUS^2], outer first.

    The ray is phi_c^-1 of the straight ray of Bottcher coordinates w = phi_c(z), and
    each disk covers its arc of |w| in [inner, outer]. With c_size >= |c| and
    c_size <= BOTTCHER_C_BOUND = 2.01:

    Estimate. If |z| >= 3, then |z^2 + c| >= |z|^2 - 2.01 >= |z|, so every iterate
    z_n has |z_n| >= |z|. With q = c_size / |z|^2 < 1 and |Log(1 + x)| <= |x| / (1 - |x|),
    the product formula gives |log(phi_c(z) / z)| <= sum_n 2^-(n+1) q / (1 - q) =
    eta(|z|) = q / (1 - q), so z = w exp(-d) with |d| <= eta(|z|), decreasing in |z|.

    |z| >= 0.99 |w| for |w| >= 20. The Green's function G = log|phi_c| (0 on K_c)
    is subharmonic on C; on |z| = 3 it is at most log 3 + eta(3) < log 4, as
    eta(3) <= 0.2876, so by the maximum principle G < log 4 on |z| <= 3. Since
    G(z) = log|w| >= log 20, |z| > 3, so |z| >= 20 exp(-0.2876) >= 15, then
    eta(|z|) <= eta(15) <= 0.00902 and |z| >= |w| exp(-0.00902) >= 0.991 |w|.
    """
    chain = []
    outer = START_RADIUS * START_RADIUS
    direction = unit_direction(numerator, modulus)
    while outer > START_RADIUS * (1 + 1e-9):
        inner = max(START_RADIUS, outer / START_RATIO)
        smallest = inner * 0.99  # |z| >= 0.99 |w| >= 0.99 inner (proved above)
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
    """Encloses the preimage branch of the chain that continues from the junction disk.

    The chain's disks B_j hold consecutive arcs of a ray; the ray of half the angle
    holds consecutive arcs A_j with f_c(A_j) in B_j, and A_1 starts in the junction
    disk. Each B_j = B(w, r) misses c, since r + |c - c0| plus the rounding of u = w - c0
    stays below 0.9 |u|, so f_c^-1(B_j) is two sets +-S_j, and S_j lies in B(sqrt(u), rho):

    Square-root lemma. If |u' - u| <= s < |u| = S, the root of u' on the branch
    continuous from sqrt(u) satisfies |sqrt(u') - sqrt(u)| <= s / (sqrt(S) (1 +
    sqrt(1 - s / S))). Rotate so that u = S > 0; then Re u' >= S - s and |u'| >= S - s,
    so Re sqrt(u') = sqrt((|u'| + Re u') / 2) >= sqrt(S - s), and |sqrt(u') - sqrt(u)| =
    |u' - u| / |sqrt(u') + sqrt(u)| <= s / (sqrt(S - s) + sqrt(S)).

    That bound is below sqrt(S), so the disks about +-sqrt(u) are disjoint and the
    connected arc A_j lies in one of them; it starts where A_(j-1) ends, so its disk
    meets the last one chosen. The distance test is outward, so the true sign always
    tests as meeting; when exactly one sign does, it is the true one, and otherwise
    the proof stops.
    """
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
    proof. An underestimated junction distance can only add a "meets", so at worst
    it refuses a step.
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
    """Krawczyk with the target ranging over D: every w in D has one f^p-preimage in D.

    Lemma. Let D be the closed disk B(m, r), F = f_c^p and Y = 1 / F'(m) as computed
    (any number would do). For w in D, K_w(z) = z - Y (F(z) - w) has |K_w'(z)| =
    |1 - Y F'(z)| <= kappa on D, with kappa enclosing |1 - Y F'(m)| + |Y| sup|F' - F'(m)|,
    and |K_w(m) - m| <= |Y| (|F(m) - m| + r) <= shift. By the mean-value inequality on
    the convex D, K_w maps D into B(m, shift + kappa r), inside D when the test
    passes, as a kappa-contraction, kappa < 1. By Banach's fixed-point theorem K_w has
    one fixed point in D, that is, one z in D with F(z) = w. So the inverse branch g of
    F maps D into B(m, shift + kappa r); g is holomorphic, as |1 - Y F'| < 1 keeps F'
    from vanishing on D.
    """
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
    """Landing or None: both rays pulled back until one disk certifies their common end.

    Landing lemma. Every p-th pull-back, the disks of the last p pull-backs of each
    ray cover one period of its potential, an arc gamma_0, and lie in D = B(m, r).
    Suppose maps_into_itself passes, so the inverse branch g maps D into B(m, r')
    with r' < r. Normalise D to the unit disk: g = s h with s = r' / r < 1 and h a
    holomorphic self-map of the disk. By the Schwarz-Pick lemma h does not increase
    the hyperbolic distance, and z -> s z shrinks it by the factor s, as the density
    2 / (1 - |z|^2) is at least 2 / (1 - s^2 |z|^2); so g is an s-contraction of the complete
    hyperbolic metric. It has one fixed point zeta, and g^n -> zeta uniformly on D,
    whose image g(D) has bounded hyperbolic diameter. |g'(zeta)| <= s, so zeta is a
    repelling periodic point. The next period inward, gamma_1, is a connected arc
    with f^p(gamma_1) = gamma_0 in D that starts at gamma_0's inner end, in D. Each
    point of gamma_1 in D is g of its image, so it lies in B(m, r'), inside D; thus
    gamma_1 meets D in a set both open and closed in gamma_1, so gamma_1 lies in D
    and in g(gamma_0). By induction gamma_k lies in g^k(D), which shrinks to zeta:
    both rays land at zeta.
    """
    modulus = (1 << period) - 1
    first = doubling_cycle(lower, modulus)
    cycles = [first] if upper in first else [first, doubling_cycle(upper, modulus)]
    # An upper bound of |c| on the disk: the factor absorbs the size's, the
    # conversions' and the sum's rounding.
    c_size = (float(arith.size(c)) + float(c_radius)) * 1.000001
    if not c_size <= BOTTCHER_C_BOUND:
        return None
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
