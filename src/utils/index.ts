import {
    AirConditionerSettings,
    DeviceSettingsInterface,
    DeviceType,
    GlobalSettingsInterface,
    SceneSettingsInterface,
} from './interface'
import { DeviceStatus } from '@smartthings/core-sdk'

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

interface FetchAPI {
    body?: BodyInit
    endpoint: string
    method: string
    accessToken: string
}

export async function fetchApi<T>({ body, endpoint, method, accessToken }: FetchAPI): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
    }

    if (body) {
        headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(`https://api.smartthings.com/v1${endpoint}`, {
        method,
        headers,
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
    deviceType?: DeviceType
    acSupport?: AirConditionerSettings
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

const normalizeMain = (deviceStatus: DeviceStatus): Record<string, any> => {
    return (deviceStatus.components?.main as Record<string, any>) || {}
}

export const detectDeviceType = (deviceStatus: DeviceStatus): DeviceType => {
    const main = normalizeMain(deviceStatus)

    if (main.airConditionerMode || main.thermostatCoolingSetpoint || main.thermostatMode) {
        return 'airConditioner'
    }
    if (main.doorControl) {
        return 'garageDoor'
    }
    if (main.switch && main.switchLevel) {
        return 'light'
    }
    if (main.switch) {
        return 'switch'
    }
    if (main.audioVolume || main.tvChannel || main.mediaPlayback || main.mediaInputSource) {
        return 'tv'
    }

    return 'unknown'
}

export const summarizeAcSupport = (deviceStatus: DeviceStatus): AirConditionerSettings => {
    const main = normalizeMain(deviceStatus)

    const modes =
        main.airConditionerMode?.supportedAcModes?.value ||
        main.thermostatMode?.supportedThermostatModes?.value ||
        []

    const swingModes =
        main.fanOscillationMode?.supportedFanOscillationModes?.value ||
        main.swingMode?.supportedSwingModes?.value ||
        []

    const minTemperature =
        main.thermostatCoolingSetpoint?.minimumCoolingSetpoint?.value ||
        main.thermostatCoolingSetpoint?.minCoolingSetpoint?.value ||
        main.thermostatSetpoint?.minimumSetpoint?.value ||
        undefined

    const maxTemperature =
        main.thermostatCoolingSetpoint?.maximumCoolingSetpoint?.value ||
        main.thermostatCoolingSetpoint?.maxCoolingSetpoint?.value ||
        main.thermostatSetpoint?.maximumSetpoint?.value ||
        undefined

    const temperatureUnit =
        main.temperatureMeasurement?.temperature?.unit ||
        main.thermostatCoolingSetpoint?.coolingSetpoint?.unit ||
        undefined

    const supportsWindFree =
        (main.airConditionerOptionalMode?.supportedAcOptionalModes?.value || []).includes('windFree') ||
        (main.custom?.airConditionerOptionalMode?.supportedAcOptionalModes?.value || []).includes('windFree') ||
        false

    return {
        availableModes: modes,
        availableSwingModes: swingModes,
        supportsWindFree,
        minTemperature,
        maxTemperature,
        temperatureUnit,
    }
}

const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
    airConditioner: 'AC',
    tv: 'TV',
    garageDoor: 'Garage',
    light: 'Light',
    switch: 'Switch',
    unknown: 'Device',
}

export const formatDeviceLabel = (label: string, deviceType: DeviceType): string => {
    const suffix = DEVICE_TYPE_LABELS[deviceType] || 'Device'
    return `${label} (${suffix})`
}