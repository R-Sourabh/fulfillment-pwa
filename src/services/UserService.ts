import { api, client, hasError } from '@/adapter';
import store from '@/store';

const login = async (username: string, password: string): Promise <any> => {
  return api({
    url: "login", 
    method: "post",
    data: {
      'USERNAME': username, 
      'PASSWORD': password
    }
  });
}

const getFacilityDetails = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload,
    cache: true
  })
}

const getFacilityOrderCount = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload
  })
}

const updateFacility = async (payload: any): Promise<any> => {
  return api({
    url: "service/updateFacility",
    method: "post",
    data: payload
  })
}

const updateFacilityToGroup = async (payload: any): Promise<any> => {
  return api({
    url: "service/updateFacilityToGroup",
    method: "post",
    data: payload
  })
}

const addFacilityToGroup = async (payload: any): Promise<any> => {
  return api({
    url: "service/addFacilityToGroup",
    method: "post",
    data: payload
  })
}

const getFacilityGroupDetails = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload
  })
}

const getFacilityGroupAndMemberDetails = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload
  })
}

const recycleInProgressOrders = async(payload: any): Promise<any> => {
  return api({
    url: "service/bulkRejectStoreInProgressOrders",
    method: "post",
    data: payload
  })
}

const recycleOutstandingOrders = async(payload: any): Promise<any> => {
  return api({
    url: "service/bulkRejectStoreOutstandingOrders",
    method: "post",
    data: payload
  })
}

const getEComStores = async (token: any,  facility: any): Promise<any> => {
  try {
    const params = {
      "inputFields": {
        "storeName_op": "not-empty",
        facilityId: facility.facilityId
      },
      "fieldList": ["productStoreId", "storeName"],
      "entityName": "ProductStoreFacilityDetail",
      "distinct": "Y",
      "noConditionFind": "Y",
      "filterByDate": 'Y',
    }
    const baseURL = store.getters['user/getBaseUrl'];
    const resp = await client({
      url: "performFind",
      method: "get",
      baseURL,
      params,
      headers: {
        Authorization:  'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    if (hasError(resp)) {
      // Following promise reject pattern as OMS api, to show error message on the login page.
      return Promise.reject({
        code: 'error',
        message: `Failed to fetch product stores for ${facility.facilityName} facility.`,
        serverResponse: resp.data
      })
    } else {
      return Promise.resolve(resp.data.docs);
    }
  } catch(error: any) {
    return Promise.reject({
      code: 'error',
      message: 'Something went wrong',
      serverResponse: error
    })
  }
}

const getPreferredStore = async (token: any): Promise<any> => {
  const baseURL = store.getters['user/getBaseUrl'];
  try {
    const resp = await client({
      url: "service/getUserPreference",
      //TODO Due to security reasons service model of OMS 1.0 does not support sending parameters in get request that's why we use post here
      method: "post",
      baseURL,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      data: {
        'userPrefTypeId': 'SELECTED_BRAND'
      },
    });
    if (hasError(resp)) {
      return Promise.reject(resp.data);
    } else {
      return Promise.resolve(resp.data.userPrefValue);
    }
  } catch (error: any) {
    return Promise.reject(error)
  }
}

const getUserPermissions = async (payload: any, token: any): Promise<any> => {
  const baseURL = store.getters['user/getBaseUrl'];
  let serverPermissions = [] as any;

  // If the server specific permission list doesn't exist, getting server permissions will be of no use
  // It means there are no rules yet depending upon the server permissions.
  if (payload.permissionIds && payload.permissionIds.length == 0) return serverPermissions;
  // TODO pass specific permissionIds
  let resp;
  // TODO Make it configurable from the environment variables.
  // Though this might not be an server specific configuration, 
  // we will be adding it to environment variable for easy configuration at app level
  const viewSize = 200;

  try {
    const params = {
      "viewIndex": 0,
      viewSize,
      permissionIds: payload.permissionIds
    }
    resp = await client({
      url: "getPermissions",
      method: "post",
      baseURL,
      data: params,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    })
    if (resp.status === 200 && resp.data.docs?.length && !hasError(resp)) {
      serverPermissions = resp.data.docs.map((permission: any) => permission.permissionId);
      const total = resp.data.count;
      const remainingPermissions = total - serverPermissions.length;
      if (remainingPermissions > 0) {
        // We need to get all the remaining permissions
        const apiCallsNeeded = Math.floor(remainingPermissions / viewSize) + (remainingPermissions % viewSize != 0 ? 1 : 0);
        const responses = await Promise.all([...Array(apiCallsNeeded).keys()].map(async (index: any) => {
          const response = await client({
            url: "getPermissions",
            method: "post",
            baseURL,
            data: {
              "viewIndex": index + 1,
              viewSize,
              permissionIds: payload.permissionIds
            },
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json'
            }
          })
          if (!hasError(response)) {
            return Promise.resolve(response);
          } else {
            return Promise.reject(response);
          }
        }))
        const permissionResponses = {
          success: [],
          failed: []
        }
        responses.reduce((permissionResponses: any, permissionResponse: any) => {
          if (permissionResponse.status !== 200 || hasError(permissionResponse) || !permissionResponse.data?.docs) {
            permissionResponses.failed.push(permissionResponse);
          } else {
            permissionResponses.success.push(permissionResponse);
          }
          return permissionResponses;
        }, permissionResponses)

        serverPermissions = permissionResponses.success.reduce((serverPermissions: any, response: any) => {
          serverPermissions.push(...response.data.docs.map((permission: any) => permission.permissionId));
          return serverPermissions;
        }, serverPermissions)

        // If partial permissions are received and we still allow user to login, some of the functionality might not work related to the permissions missed.
        // Show toast to user intimiting about the failure
        // Allow user to login
        // TODO Implement Retry or improve experience with show in progress icon and allowing login only if all the data related to user profile is fetched.
        if (permissionResponses.failed.length > 0) Promise.reject("Something went wrong while getting complete user permissions.");
      }
    }
    return serverPermissions;
  } catch (error: any) {
    return Promise.reject(error);
  }
}

const getUserProfile = async (token: any): Promise<any> => {
  const baseURL = store.getters['user/getBaseUrl'];
  try {
    const resp = await client({
      url: "user-profile",
      method: "get",
      baseURL,
      headers: {
        Authorization:  'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    if(hasError(resp)) return Promise.reject("Error getting user profile: " + JSON.stringify(resp.data));
    return Promise.resolve(resp.data)
  } catch(error: any) {
    return Promise.reject(error)
  }
}

const setUserPreference = async (payload: any): Promise<any> => {
  return api({
    url: "service/setUserPreference",
    method: "post",
    data: payload
  });
}

const createFieldMapping = async (payload: any): Promise <any> => {
  return api({
    url: "/service/createDataManagerMapping",
    method: "POST",
    data: payload
  });
}

const updateFieldMapping = async (payload: any): Promise <any> => {
  return api({
    url: "/service/updateDataManagerMapping",
    method: "POST",
    data: payload
  });
}

const deleteFieldMapping = async (payload: any): Promise <any> => {
  return api({
    url: "/service/deleteDataManagerMapping",
    method: "POST",
    data: payload
  });
}

const getFieldMappings = async (payload: any): Promise <any> => {
  return api({
    url: "/performFind",
    method: "POST",
    data: payload
  });
}
const getPartialOrderRejectionConfig = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload,
  });
}

const createEnumeration = async (payload: any): Promise<any> => {
  return api({
    url: "service/createEnumeration",
    method: "post",
    data: payload
  })
}

const isEnumExists = async (enumId: string): Promise<any> => {
  try {
    const resp = await api({
      url: 'performFind',
      method: 'POST',
      data: {
        entityName: "Enumeration",
        inputFields: {
          enumId
        },
        viewSize: 1,
        fieldList: ["enumId"],
        noConditionFind: 'Y'
      }
    }) as any

    if (!hasError(resp) && resp.data.docs.length) {
      return true
    }
    return false
  } catch (err) {
    return false
  }
}

const getNewRejectionApiConfig = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload,
  });
}

const getDisableShipNowConfig = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload,
  });
}

const getDisableUnpackConfig = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload,
  });
}

const createPartialOrderRejectionConfig = async (payload: any): Promise<any> => {
  return api({
    url: "service/createProductStoreSetting",
    method: "post",
    data: payload
  });
}

const updatePartialOrderRejectionConfig = async (payload: any): Promise<any> => {
  return api({
    url: "service/updateProductStoreSetting",
    method: "post",
    data: payload
  });
}

const getCollateralRejectionConfig = async (payload: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: payload,
  });
}
const createCollateralRejectionConfig = async (payload: any): Promise<any> => {
  return api({
    url: "service/createProductStoreSetting",
    method: "post",
    data: payload
  });
}
const updateCollateralRejectionConfig = async (payload: any): Promise<any> => {
  return api({
    url: "service/updateProductStoreSetting",
    method: "post",
    data: payload
  });
}


export const UserService = {
    addFacilityToGroup,
    createCollateralRejectionConfig,
    createEnumeration,
    createFieldMapping,
    createPartialOrderRejectionConfig,
    deleteFieldMapping,
    login,
    getCollateralRejectionConfig,
    getDisableShipNowConfig,
    getDisableUnpackConfig,
    getEComStores,
    getFacilityDetails,
    getFacilityOrderCount,
    getFieldMappings,
    getFacilityGroupDetails,
    getFacilityGroupAndMemberDetails,
    getNewRejectionApiConfig,
    getPartialOrderRejectionConfig,
    getUserProfile,
    getPreferredStore,
    isEnumExists,
    recycleInProgressOrders,
    recycleOutstandingOrders,
    setUserPreference,
    getUserPermissions,
    updateFacility,
    updateFacilityToGroup,
    updateFieldMapping,
    updateCollateralRejectionConfig,
    updatePartialOrderRejectionConfig
}