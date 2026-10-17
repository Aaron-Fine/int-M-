# Check the simplified closed forms derived from multpoly.py output.
from sympy import symbols, expand, simplify, sqrt, I
c, L, nu, mu = symbols('c L nu mu')
M3 = L**2 - 8*L*c - 16*L + 64*c**3 + 128*c**2 + 64*c + 64
M4 = -L**3 - 16*L**2*c**2 + 48*L**2 + 256*L*c**4 + 256*L*c**3 - 256*L*c**2 - 768*L + 4096*(c**6 + 3*c**5 + 3*c**4 + 3*c**3 + 2*c**2 + 1)
G3 = c**3 + 2*c**2 + c + 1
G4 = c**6 + 3*c**5 + 3*c**4 + 3*c**3 + 2*c**2 + 1
print("M3(8nu)/64 == nu^2-(c+2)nu+G3:", expand(M3.subs(L, 8*nu)/64 - (nu**2 - (c+2)*nu + G3)) == 0)
print("  as poly in c: c^3+2c^2+(1-nu)c+(1-nu)^2:", expand(M3.subs(L, 8*nu)/64 - (c**3 + 2*c**2 + (1-nu)*c + (1-nu)**2)) == 0)
for s in (1, -1):
    lam = 4*c + 8 + s*4*I*c*sqrt(4*c + 7)
    print("  root check", s, simplify(expand(M3.subs(L, lam))) == 0)
print("-M4(16mu)/4096 == mu^3+(c^2-3)mu^2-(c^4+c^3-c^2-3)mu-G4:",
      expand(-M4.subs(L, 16*mu)/4096 - (mu**3 + (c**2 - 3)*mu**2 - (c**4 + c**3 - c**2 - 3)*mu - G4)) == 0)
