# EventsApi

All URIs are relative to *http://localhost:3000/api/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createEvent**](#createevent) | **POST** /events | Create new event|
|[**deleteEvent**](#deleteevent) | **DELETE** /events/{id} | Delete event|
|[**getEventById**](#geteventbyid) | **GET** /events/{id} | Get event details|
|[**getEvents**](#getevents) | **GET** /events | List all events|
|[**updateEvent**](#updateevent) | **PUT** /events/{id} | Update event|

# **createEvent**
> StandardResponse createEvent(createEventRequest)


### Example

```typescript
import {
    EventsApi,
    Configuration,
    CreateEventRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new EventsApi(configuration);

let createEventRequest: CreateEventRequest; //

const { status, data } = await apiInstance.createEvent(
    createEventRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createEventRequest** | **CreateEventRequest**|  | |


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
|**201** | Event created |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteEvent**
> deleteEvent()


### Example

```typescript
import {
    EventsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EventsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.deleteEvent(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

void (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Event deleted |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getEventById**
> StandardResponse getEventById()


### Example

```typescript
import {
    EventsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EventsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getEventById(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**StandardResponse**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Event details |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getEvents**
> PaginatedResponse getEvents()


### Example

```typescript
import {
    EventsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EventsApi(configuration);

let page: number; // (optional) (default to 1)
let limit: number; // (optional) (default to 20)
let status: 'draft' | 'published' | 'sold_out' | 'cancelled' | 'completed'; // (optional) (default to undefined)

const { status, data } = await apiInstance.getEvents(
    page,
    limit,
    status
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **page** | [**number**] |  | (optional) defaults to 1|
| **limit** | [**number**] |  | (optional) defaults to 20|
| **status** | [**&#39;draft&#39; | &#39;published&#39; | &#39;sold_out&#39; | &#39;cancelled&#39; | &#39;completed&#39;**]**Array<&#39;draft&#39; &#124; &#39;published&#39; &#124; &#39;sold_out&#39; &#124; &#39;cancelled&#39; &#124; &#39;completed&#39;>** |  | (optional) defaults to undefined|


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
|**200** | Events list |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **updateEvent**
> updateEvent(event)


### Example

```typescript
import {
    EventsApi,
    Configuration,
    Event
} from './api';

const configuration = new Configuration();
const apiInstance = new EventsApi(configuration);

let id: string; // (default to undefined)
let event: Event; //

const { status, data } = await apiInstance.updateEvent(
    id,
    event
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **event** | **Event**|  | |
| **id** | [**string**] |  | defaults to undefined|


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
|**200** | Event updated |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

