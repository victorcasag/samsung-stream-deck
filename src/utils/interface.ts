import { SelectElement } from './index'

export interface GlobalSettingsInterface {
    accessToken: string
}

export type DeviceType =
    | 'airConditioner'
    | 'tv'
    | 'garageDoor'
    | 'light'
    | 'switch'
    | 'unknown'

export type DeviceBehaviour =
    | 'toggle'
    | 'more'
    | 'less'
    | 'acPower'
    | 'acModeCycle'
    | 'acModeSet'
    | 'acTempUp'
    | 'acTempDown'
    | 'acSetTemperature'
    | 'acSwingVerticalToggle'
    | 'acSwingHorizontalToggle'
    | 'acWindFreeToggle'

export interface CommonSettingsInterface {
    selectOptions?: SelectElement[]
}
export interface SceneSettingsInterface extends CommonSettingsInterface {
    sceneId: string
}

export interface AirConditionerSettings {
    availableModes?: string[]
    availableSwingModes?: string[]
    supportsWindFree?: boolean
    minTemperature?: number
    maxTemperature?: number
    targetMode?: string
    targetTemperature?: number
    temperatureStep?: number
    temperatureUnit?: 'C' | 'F'
}

export interface DeviceSettingsInterface extends CommonSettingsInterface, AirConditionerSettings {
    deviceId: string
    behaviour: DeviceBehaviour
    deviceType?: DeviceType
}