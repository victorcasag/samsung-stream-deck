import {
  DeviceSettingsInterface,
  GlobalSettingsInterface,
  SceneSettingsInterface,
  AirConditionerSettingsInterface,
} from './interface'

export function isGlobalSettingsSet(
  settings: GlobalSettingsInterface | unknown
): settings is GlobalSettingsInterface {
  return (settings as GlobalSettingsInterface).accessToken !== undefined
}

export function isDeviceSetting(
  settings: DeviceSettingsInterface | unknown
): settings is DeviceSettingsInterface {
  return (settings as DeviceSettingsInterface).deviceId !== undefined
}

export function isSceneSetting(
  settings: SceneSettingsInterface | unknown
): settings is SceneSettingsInterface {
  return (settings as SceneSettingsInterface).sceneId !== undefined
}

export function isAirConditionerSetting(
  settings: AirConditionerSettingsInterface | unknown
): settings is AirConditionerSettingsInterface {
  return (settings as AirConditionerSettingsInterface).controlType !== undefined
}

// Device type identification based on capabilities
export function getDeviceType(device: any): string {
  const components = device.components?.main || {}

  // Check for air conditioner
  if ('airConditionerMode' in components || 'thermostatCoolingSetpoint' in components) {
    return '❄️ AC'
  }

  // Check for garage door
  if ('doorControl' in components) {
    return '🚪 Garage'
  }

  // Check for light (has switchLevel capability)
  if ('switchLevel' in components && 'switch' in components) {
    return '💡 Light'
  }

  // Check for TV
  if ('mediaPlayback' in components || 'audioVolume' in components) {
    return '📺 TV'
  }

  // Check for switch (only has switch capability)
  if ('switch' in components) {
    return '🔌 Switch'
  }

  return '⚙️ Device'
}

interface FetchAPI {
  body?: BodyInit
  endpoint: string
  method: string
  accessToken: string
}

export async function fetchApi<T>({ body, endpoint, method, accessToken }: FetchAPI): Promise<T> {
  const response = await fetch(`https://api.smartthings.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  })

  if (!response.ok) {
    const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`)
    error.status = response.status
    error.statusText = response.statusText
    throw error
  }

  return await response.json()
}

export interface SelectElement {
  id?: string
  name?: string
}
interface AddSelectOption {
  select: HTMLSelectElement
  element: SelectElement
}

export const addSelectOption = ({ select, element }: AddSelectOption): void => {
  if (element.id && element.name) {
    const option = document.createElement('option')
    option.value = element.id
    option.text = element.name.slice(0, 30) // limit to 30 char to avoid display bug in the PI
    select.add(option)
  }
}