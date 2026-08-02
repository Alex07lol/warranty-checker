# Backend

This directory will contain the Node.js/Express backend for WarrantyVault.

Implementation begins on Day 2. See [../docs/day2-plan.md](../docs/day2-plan.md) for the complete step-by-step implementation plan.

## Planned Structure

```
backend/
├── src/
│   ├── config/         - Database and Cloudinary configuration
│   ├── controllers/    - Express request handlers
│   ├── middleware/     - Auth, validation, error handling, upload
│   ├── models/         - Mongoose schemas
│   ├── routes/         - Express router definitions
│   ├── services/       - Business logic layer
│   ├── utils/          - Helper functions and utilities
│   └── validators/     - Joi validation schemas
├── tests/              - Jest unit and integration tests
├── .env.example        - Environment variable template
└── package.json        - Added Day 2
```

## Environment Setup

Copy `.env.example` to `.env` and fill in all values before starting.

See the [API Design](../docs/api-design.md) for endpoint documentation.
