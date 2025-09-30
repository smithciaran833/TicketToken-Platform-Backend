# BlockchainApi

All URIs are relative to *http://localhost:3000/api/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**mintTicketNFT**](#mintticketnft) | **POST** /tickets/{id}/mint | Mint ticket as NFT|

# **mintTicketNFT**
> MintTicketNFT200Response mintTicketNFT(mintTicketNFTRequest)


### Example

```typescript
import {
    BlockchainApi,
    Configuration,
    MintTicketNFTRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new BlockchainApi(configuration);

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

