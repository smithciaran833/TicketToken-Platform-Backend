# LoginResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**token** | **string** | JWT access token | [optional] [default to undefined]
**refreshToken** | **string** | JWT refresh token | [optional] [default to undefined]
**user** | [**User**](User.md) |  | [optional] [default to undefined]
**expiresIn** | **number** | Token expiry in seconds | [optional] [default to undefined]

## Example

```typescript
import { LoginResponse } from './api';

const instance: LoginResponse = {
    token,
    refreshToken,
    user,
    expiresIn,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
