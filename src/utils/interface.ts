import { SelectElement } from './index'

export interface GlobalSettingsInterface {
  accessToken: string
}

export interface CommonSettingsInterface {
  selectOptions?: SelectElement[]
}
export interface SceneSettingsInterface extends CommonSettingsInterface {
  sceneId: string
}

export interface DeviceSettingsInterface extends CommonSettingsInterface {
  deviceId: string
  behaviour: string
}

export interface AirConditionerSettingsInterface extends CommonSettingsInterface {
  deviceId: string
  controlType: 'power' | 'mode' | 'temp_up' | 'temp_down' | 'fan_mode' | 'swing_vertical' | 'swing_horizontal' | 'windfree'
}