import { api, apiClient } from '@/adapter';
import store from '@/store';


const fetchProducts = async (query: any): Promise <any>  => {
  return api({
   // TODO: We can replace this with any API
    url: "searchProducts", 
    method: "post",
    data: query,
    cache: true
  });
}

const fetchProductComponents = async (payload: any): Promise<any> => {
  const omstoken = store.getters['user/getUserToken'];
  const baseURL = store.getters['user/getMaargBaseUrl'];

  return apiClient({
    url: `/oms/dataDocumentView`,
    method: "post",
    baseURL,
    headers: {
      "Authorization": "Bearer " + omstoken,
      "Content-Type": "application/json"
    },
    data: payload,
  });
}

const fetchProductsAverageCost = async (productIds: any, facilityId: any): Promise<any> => {
  const omstoken = store.getters['user/getUserToken'];
  const baseURL = store.getters['user/getMaargBaseUrl'];
  
  if(!productIds.length) return []
  const requests = [], productIdList = productIds, productAverageCostDetail = {} as any;

  while(productIdList.length) {
    const productIds = productIdList.splice(0, 100)
    const params = {
      customParametersMap: {
        facilityId,
        productId: productIds,
        productId_op: "in",
        orderByField: "-fromDate",
        pageIndex: 0,
        pageSize: 100 //There should be more than one active record per product
      },
      dataDocumentId: "ProductWeightedAverageCost",
      filterByDate: true
    }
    requests.push(params)
  }

  const productAverageCostResps = await Promise.allSettled(requests.map((payload) => apiClient({
    url: `/oms/dataDocumentView`,
    method: "post",
    baseURL,
    headers: {
      "Authorization": "Bearer " + omstoken,
      "Content-Type": "application/json"
    },
    data: payload,
  })))

  const hasFailedResponse = productAverageCostResps.some((response: any) => response.status !== "fulfilled")
  if(hasFailedResponse) return {};

  productAverageCostResps.map((response: any) => {
    if(response.value.data?.entityValueList?.length) {
      response.value.data.entityValueList.map((item: any) => {
        if(!productAverageCostDetail[item.productId]) productAverageCostDetail[item.productId] = item.averageCost
      })
    }
  })

  return productAverageCostDetail;
}

export const ProductService = {
  fetchProducts,
  fetchProductComponents,
  fetchProductsAverageCost
}