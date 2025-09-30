# Payment


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **string** |  | [optional] [default to undefined]
**userId** | **string** |  | [optional] [default to undefined]
**amount** | **number** |  | [optional] [default to undefined]
**currency** | **string** |  | [optional] [default to 'USD']
**status** | **string** |  | [optional] [default to undefined]
**stripePaymentIntentId** | **string** |  | [optional] [default to undefined]
**metadata** | **object** |  | [optional] [default to undefined]
**createdAt** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { Payment } from './api';

const instance: Payment = {
    id,
    userId,
    amount,
    currency,
    status,
    stripePaymentIntentId,
    metadata,
    createdAt,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
