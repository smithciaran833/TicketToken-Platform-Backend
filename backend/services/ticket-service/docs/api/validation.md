# Validation Errors

## Error Format

Validation errors return 400 status with detailed field errors:
```json
{
  "type": "https://api.tickettoken.com/errors/VALIDATION_ERROR",
  "title": "Validation Error",
  "status": 400,
  "detail": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "invalid_string"
    },
    {
      "field": "quantity",
      "message": "Number must be greater than 0",
      "code": "too_small"
    }
  ]
}
```

## Common Validation Errors

### Required Field Missing
```json
{
  "field": "ticketId",
  "message": "Required",
  "code": "invalid_type"
}
```

### Invalid UUID
```json
{
  "field": "eventId",
  "message": "Invalid UUID format",
  "code": "invalid_string"
}
```

### Invalid Date
```json
{
  "field": "expiresAt",
  "message": "Invalid ISO 8601 date format",
  "code": "invalid_date"
}
```

### String Too Long
```json
{
  "field": "description",
  "message": "String must contain at most 1000 characters",
  "code": "too_big"
}
```

### Number Out of Range
```json
{
  "field": "quantity",
  "message": "Number must be between 1 and 10",
  "code": "too_small"
}
```

### Invalid Enum Value
```json
{
  "field": "status",
  "message": "Invalid enum value. Expected 'active' | 'inactive'",
  "code": "invalid_enum_value"
}
```

### Array Too Large
```json
{
  "field": "ticketIds",
  "message": "Array must contain at most 50 items",
  "code": "too_big"
}
```

### Unknown Field (Strict Mode)
```json
{
  "field": "unknownField",
  "message": "Unrecognized key",
  "code": "unrecognized_keys"
}
```

## Request Examples

### Valid Purchase Request
```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "ticketTypeId": "660e8400-e29b-41d4-a716-446655440001",
  "quantity": 2
}
```

### Invalid Purchase Request
```json
{
  "eventId": "not-a-uuid",
  "ticketTypeId": "",
  "quantity": -1,
  "extraField": "not allowed"
}
```

Response:
```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "errors": [
    { "field": "eventId", "message": "Invalid UUID format" },
    { "field": "ticketTypeId", "message": "Required" },
    { "field": "quantity", "message": "Number must be greater than 0" },
    { "field": "extraField", "message": "Unrecognized key" }
  ]
}
```
