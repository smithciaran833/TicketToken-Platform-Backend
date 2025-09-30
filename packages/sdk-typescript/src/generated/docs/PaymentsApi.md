# PaymentsApi

All URIs are relative to *http://localhost:3000/api/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createPaymentIntent**](#createpaymentintent) | **POST** /payments/create-intent | Create payment intent|
|[**handlePaymentWebhook**](#handlepaymentwebhook) | **POST** /payments/webhook | Stripe webhook handler|

# **createPaymentIntent**
> CreatePaymentIntent200Response createPaymentIntent(createPaymentIntentRequest)


### Example

```typescript
import {
    PaymentsApi,
    Configuration,
    CreatePaymentIntentRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentsApi(configuration);

let createPaymentIntentRequest: CreatePaymentIntentRequest; //

const { status, data } = await apiInstance.createPaymentIntent(
    createPaymentIntentRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createPaymentIntentRequest** | **CreatePaymentIntentRequest**|  | |


### Return type

**CreatePaymentIntent200Response**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment intent created |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **handlePaymentWebhook**
> handlePaymentWebhook(body)


### Example

```typescript
import {
    PaymentsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentsApi(configuration);

let body: object; //

const { status, data } = await apiInstance.handlePaymentWebhook(
    body
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **body** | **object**|  | |


### Return type

void (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Webhook processed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

