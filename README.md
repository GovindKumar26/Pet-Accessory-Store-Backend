Velvet Tails Backend - FINAL
====================

This backend includes admin endpoints (product CRUD, inventory updates, discounts, tax config),
public product browsing, auth (access + refresh), orders, and mocked payment endpoints.

Admin endpoints:
- POST/PUT/DELETE /api/admin/products
- POST /api/admin/inventory (bulk update)
- CRUD /api/admin/discounts
- GET/PUT /api/admin/tax

Auth:
- /api/auth/register, /api/auth/login, /api/auth/logout
- /api/auth/refresh (reads refreshToken cookie and returns new access token)
- /api/auth/me

Seed creates test users:
- test@example.com / password123 (role: user)
- admin@example.com / password123 (role: admin)

Quick start:
1. Copy `.env.example` to `.env` and set values.
2. `npm install`
3. `npm run seed`
4. `npm run dev`
