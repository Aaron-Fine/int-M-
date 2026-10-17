# Derive dynatomic polynomials, Gleason centre polynomials, and multiplier
# polynomials M_p(L, c) for p = 1..4 (sympy, exact).
from sympy import symbols, expand, div, factor_list, resultant, Poly, degree, gcd, sqf_list, cancel, factor
z, c, L = symbols('z c L')
def f(w): return expand(w*w + c)
def iterate(w, n):
    for _ in range(n): w = f(w)
    return w
def divisors(n): return [d for d in range(1, n+1) if n % d == 0]
dyn = {}
def dynatomic(p):
    # Phi_p = prod_{d|p} (f^d(z)-z)^{mu(p/d)}
    from sympy import mobius
    num, den = 1, 1
    for d in divisors(p):
        m = mobius(p // d)
        g = iterate(z, d) - z
        if m == 1: num = expand(num * g)
        elif m == -1: den = expand(den * g)
    q, r = div(Poly(num, z), Poly(den, z))
    assert r.is_zero
    return q.as_expr()
for p in range(1, 5):
    Ph = dynatomic(p); dyn[p] = Ph
    print(f"p={p}: deg_z Phi_p = {degree(Ph, z)}  -> {degree(Ph, z)//p} cycles")
    # multiplier of the cycle through z: prod_{j<p} 2 f^j(z), reduced mod Phi_p
    D = 1
    for j in range(p): D = expand(D * 2 * iterate(z, j))
    D = Poly(D, z).rem(Poly(Ph, z)).as_expr()
    R = resultant(Poly(Ph, z), Poly(L - D, z))
    R = factor(R)
    print("  Res = ", R if p < 3 else "(big)")
    fl = factor_list(expand(R))
    for fac, mult in fl[1]:
        print(f"  factor^{mult}: ", expand(fac))
# Gleason centre polynomials: f^p(0) with lower-period centres divided out
print("Gleason:")
for p in range(1, 5):
    g = iterate(0, p)
    print(p, factor(g))
