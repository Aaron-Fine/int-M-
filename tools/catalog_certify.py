"""Certified isolation of hyperbolic-component centres (ADR 0014).

A centre of period p is a root of g_p(c) = f_c^p(0), with f_c(z) = z^2 + c.
Ball arithmetic in `precision`-digit decimals encloses g_p(x) and g_p' over
a disk B(x, r); the Krawczyk test then proves that the disk holds exactly one
root of g_p and that it is simple. Enclosing f_c^d(0) over the same disk and
finding it bounded away from 0 for every proper divisor d of p proves that the
root's period is exactly p.

Every rounding is accounted for: a midpoint operation adds `ROUNDING` times
its operands' magnitudes to the radius, and every radius and magnitude bound
is inflated by `INFLATE`. With 80 digits a decimal operation errs by at most
5e-80 relative, so the margins below are generous.

This module is application source code, licensed under GPL-3.0-only.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, localcontext

Pair = tuple[Decimal, Decimal]


@dataclass(frozen=True)
class Ball:
    """The closed disk of complex numbers within `radius` of (re, im)."""

    re: Decimal
    im: Decimal
    radius: Decimal


@dataclass(frozen=True)
class Arithmetic:
    """Ball operations at one decimal precision, with outward rounding."""

    precision: int

    @property
    def rounding(self) -> Decimal:
        return Decimal(10) ** (3 - self.precision)

    @property
    def inflate(self) -> Decimal:
        return 1 + Decimal(10) ** (5 - self.precision)

    def magnitude(self, re: Decimal, im: Decimal) -> Decimal:
        """An upper bound of |re + i im|."""
        return (re * re + im * im).sqrt() * self.inflate

    def add(self, left: Ball, right: Ball) -> Ball:
        re, im = left.re + right.re, left.im + right.im
        error = (
            self.magnitude(left.re, left.im) + self.magnitude(right.re, right.im)
        ) * self.rounding
        return Ball(re, im, (left.radius + right.radius + error) * self.inflate)

    def multiply(self, left: Ball, right: Ball) -> Ball:
        re = left.re * right.re - left.im * right.im
        im = left.re * right.im + left.im * right.re
        size_left = self.magnitude(left.re, left.im)
        size_right = self.magnitude(right.re, right.im)
        radius = (
            size_left * right.radius
            + size_right * left.radius
            + left.radius * right.radius
            + size_left * size_right * self.rounding
        )
        return Ball(re, im, radius * self.inflate)

    def double(self, ball: Ball) -> Ball:
        return Ball(ball.re * 2, ball.im * 2, ball.radius * 2)

    def excludes_zero(self, ball: Ball) -> bool:
        """True when no point of the ball is 0."""
        return (ball.re * ball.re + ball.im * ball.im).sqrt() > ball.radius * self.inflate

    def orbit(self, parameter: Ball, steps: int) -> list[tuple[Ball, Ball]]:
        """Enclosures of (f_c^n(0), d/dc f_c^n(0)) over the ball, n = 1..steps."""
        zero = Ball(Decimal(0), Decimal(0), Decimal(0))
        one = Ball(Decimal(1), Decimal(0), Decimal(0))
        value, derivative = zero, zero
        enclosures: list[tuple[Ball, Ball]] = []
        for _step in range(steps):
            derivative = self.add(self.multiply(self.double(value), derivative), one)
            value = self.add(self.multiply(value, value), parameter)
            enclosures.append((value, derivative))
        return enclosures


def proper_divisors(value: int) -> list[int]:
    return [candidate for candidate in range(1, value) if value % candidate == 0]


@dataclass(frozen=True)
class Certificate:
    """B(centre, radius) holds exactly one root of g_p, simple and of exact period p."""

    radius: Decimal
    contraction: Decimal


def certify_center(center: Pair, period: int, radius: Decimal, precision: int) -> Certificate:
    """Proves that B(center, radius) isolates a centre of exact period `period`.

    Raises ValueError when a test fails; the caller then has no proof.
    """
    arithmetic = Arithmetic(precision)
    with localcontext() as context:
        context.prec = precision
        point = Ball(center[0], center[1], Decimal(0))
        disk = Ball(center[0], center[1], radius)
        value = arithmetic.orbit(point, period)[-1][0]
        over_disk = arithmetic.orbit(disk, period)
        slope = over_disk[-1][1]
        # y ≈ 1 / g'(x); any y works, a good one makes the test pass.
        norm = slope.re * slope.re + slope.im * slope.im
        inverse = Ball(slope.re / norm, -slope.im / norm, Decimal(0))
        step = arithmetic.multiply(inverse, value)
        one = Ball(Decimal(1), Decimal(0), Decimal(0))
        negated = arithmetic.multiply(inverse, slope)
        residual = arithmetic.add(one, Ball(-negated.re, -negated.im, negated.radius))
        contraction = arithmetic.magnitude(residual.re, residual.im) + residual.radius
        shift = arithmetic.magnitude(step.re, step.im) + step.radius
        # Krawczyk: K = x - y g(x) + (1 - y G')(D - x) lies inside D, and 1 - y G' < 1.
        if not (contraction < 1 and (shift + contraction * radius) * arithmetic.inflate < radius):
            raise ValueError(f"period {period}: the Krawczyk test fails at radius {radius}")
        for divisor in proper_divisors(period):
            if not arithmetic.excludes_zero(over_disk[divisor - 1][0]):
                raise ValueError(f"period {period}: f_c^{divisor}(0) may vanish in the disk")
        return Certificate(radius, contraction)
