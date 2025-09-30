# TicketsApi

All URIs are relative to *http://localhost:3000/api/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createTicket**](#createticket) | **POST** /tickets | Create/purchase ticket|
|[**getTickets**](#gettickets) | **GET** /tickets | List tickets|
|[**mintTicketNFT**](#mintticketnft) | **POST** /tickets/{id}/mint | Mint ticket as NFT|

# **createTicket**
> StandardResponse createTicket(createTicketRequest)


### Example

```typescript
import {
    TicketsApi,
    Configuration,
    CreateTicketRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new TicketsApi(configuration);

let createTicketRequest: CreateTicketRequest; //

const { status, data } = await apiInstance.createTicket(
    createTicketRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createTicketRequest** | **CreateTicketRequest**|  | |


### Return type

**StandardResponse**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Ticket created |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getTickets**
> PaginatedResponse getTickets()


### Example

```typescript
import {
    TicketsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new TicketsApi(configuration);

let eventId: string; // (optional) (default to undefined)
let userId: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.getTickets(
    eventId,
    userId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **eventId** | [**string**] |  | (optional) defaults to undefined|
| **userId** | [**string**] |  | (optional) defaults to undefined|


### Return type

**PaginatedResponse**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Tickets list |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **mintTicketNFT**
> MintTicketNFT200Response mintTicketNFT(mintTicketNFTRequest)


### Example

```typescript
import {
    TicketsApi,
    Configuration,
    MintTicketNFTRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new TicketsApi(configuration);

let id: string; // (default to undefined)
let mintTicketNFTRequest: MintTicketNFTRequest; //

const { status, data } = await apiInstance.mintTicketNFT(
    id,
    mintTicketNFTRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **mintTicketNFTRequest** | **MintTicketNFTRequest**|  | |
| **id** | [**string**] |  | defaults to undefined|


### Return type

**MintTicketNFT200Response**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | NFT minting initiated |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

