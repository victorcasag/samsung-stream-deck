import {
    DeviceBehaviour,
    DeviceSettingsInterface,
    DeviceType,
    GlobalSettingsInterface,
} from '../utils/interface'
import {
    KeyUpEvent,
    SDOnActionEvent,
    StreamDeckAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
} from 'streamdeck-typescript'
import { detectDeviceType, fetchApi, isGlobalSettingsSet } from '../utils/index'
import { DeviceStatus } from '@smartthings/core-sdk'
import { Smartthings } from '../smartthings-plugin'

type ModeContext = {
    capability: string
    command: string
    value?: string
    supported?: string[]
}

type TemperatureContext = {
    capability: string
    command: string
    value?: number
    min?: number
    max?: number
}

type SwingContext = {
    capability: string
    command: string
    value?: string
    supported?: string[]
}

type OptionalModeContext = {
    capability: string
    command: string
    value?: string
    supported?: string[]
}

type AcContext = {
    mode?: ModeContext
    temperature?: TemperatureContext
    swing?: SwingContext
    optionalMode?: OptionalModeContext
    switchState?: string
}

export class DeviceAction extends StreamDeckAction<Smartthings, DeviceAction> {
    private pollingIntervals: Map<string, NodeJS.Timeout> = new Map()
    private aggressivePollingTimeouts: Map<string, NodeJS.Timeout> = new Map()
    private readonly POLL_INTERVAL_MS = 5000 // Normal polling: every 5 seconds
    private readonly AGGRESSIVE_POLL_INTERVAL_MS = 500 // Aggressive polling: every 0.5 seconds
    private readonly AGGRESSIVE_POLL_DURATION_MS = 10000 // Poll aggressively for 10 seconds after button press

    constructor(public plugin: Smartthings, private actionName: string) {
        super(plugin, actionName)
    }

    private setDeviceImage(context: string, imageName: string): void {
        // Use setState to switch between on/off states (0 = off/closed, 1 = on/open)
        const isOn = imageName.includes('_on') || imageName.includes('open')
        const state = isOn ? 1 : 0
        console.log(`[Device] Setting state to: ${state} (${imageName})`)
        this.plugin.setState(state, context)
    }

    @SDOnActionEvent('willAppear')
    public async onWillAppear({ context, payload }: WillAppearEvent<DeviceSettingsInterface>): Promise<void> {
        // Start polling for this device when button appears
        await this.updateDeviceState(context, payload.settings)
        this.startPolling(context, payload.settings)
    }

    @SDOnActionEvent('willDisappear')
    public onWillDisappear({ context }: WillDisappearEvent<DeviceSettingsInterface>): void {
        // Stop polling when button disappears
        this.stopPolling(context)
    }

    @SDOnActionEvent('didReceiveSettings')
    public async onDidReceiveSettings({ context, payload }: DidReceiveSettingsEvent<DeviceSettingsInterface>): Promise<void> {
        // Update state when settings are received
        await this.updateDeviceState(context, payload.settings)
    }

    private startPolling(context: string, settings: DeviceSettingsInterface): void {
        // Clear any existing interval for this context
        this.stopPolling(context)

        // Set up new polling interval
        const interval = setInterval(async () => {
            await this.updateDeviceState(context, settings)
        }, this.POLL_INTERVAL_MS)

        this.pollingIntervals.set(context, interval)
    }

    private stopPolling(context: string): void {
        const interval = this.pollingIntervals.get(context)
        if (interval) {
            clearInterval(interval)
            this.pollingIntervals.delete(context)
        }
    }

    private startAggressivePolling(context: string, settings: DeviceSettingsInterface): void {
        console.log(`[Device] Starting aggressive polling for ${context}`)

        // Clear any existing aggressive polling
        this.stopAggressivePolling(context)

        // Stop normal polling temporarily
        this.stopPolling(context)

        // Start aggressive polling (every 0.5 seconds)
        const aggressiveInterval = setInterval(async () => {
            await this.updateDeviceState(context, settings)
        }, this.AGGRESSIVE_POLL_INTERVAL_MS)

        this.pollingIntervals.set(context, aggressiveInterval)

        // After 10 seconds, switch back to normal polling
        const timeout = setTimeout(() => {
            console.log(`[Device] Switching back to normal polling for ${context}`)
            this.stopPolling(context)
            this.startPolling(context, settings)
            this.aggressivePollingTimeouts.delete(context)
        }, this.AGGRESSIVE_POLL_DURATION_MS)

        this.aggressivePollingTimeouts.set(context, timeout)
    }
    private stopAggressivePolling(context: string): void {
        const timeout = this.aggressivePollingTimeouts.get(context)
        if (timeout) {
            clearTimeout(timeout)
            this.aggressivePollingTimeouts.delete(context)
        }
    }

    private async sendCommands(deviceId: string, token: string, commands: any[]): Promise<void> {
        await fetchApi({
            endpoint: `/devices/${deviceId}/commands`,
            method: 'POST',
            accessToken: token,
            body: JSON.stringify(commands),
        })
    }

    private nextValue(current: string | undefined, supported: string[]): string | undefined {
        if (!supported || supported.length === 0) return undefined
        if (!current) return supported[0]
        const index = supported.indexOf(current)
        if (index < 0) return supported[0]
        return supported[(index + 1) % supported.length]
    }

    private extractAcContext(deviceStatus: DeviceStatus): AcContext {
        const main = (deviceStatus.components?.main || {}) as Record<string, any>

        const modeContext: ModeContext | undefined = main.airConditionerMode
            ? {
                capability: 'airConditionerMode',
                command: 'setAirConditionerMode',
                value: main.airConditionerMode?.airConditionerMode?.value,
                supported: main.airConditionerMode?.supportedAcModes?.value,
            }
            : main.thermostatMode
                ? {
                    capability: 'thermostatMode',
                    command: 'setThermostatMode',
                    value: main.thermostatMode?.thermostatMode?.value,
                    supported: main.thermostatMode?.supportedThermostatModes?.value,
                }
                : undefined

        const temperatureContext: TemperatureContext | undefined = main.thermostatCoolingSetpoint
            ? {
                capability: 'thermostatCoolingSetpoint',
                command: 'setCoolingSetpoint',
                value: main.thermostatCoolingSetpoint?.coolingSetpoint?.value,
                min:
                    main.thermostatCoolingSetpoint?.minimumCoolingSetpoint?.value ||
                    main.thermostatCoolingSetpoint?.minCoolingSetpoint?.value,
                max:
                    main.thermostatCoolingSetpoint?.maximumCoolingSetpoint?.value ||
                    main.thermostatCoolingSetpoint?.maxCoolingSetpoint?.value,
            }
            : main.thermostatSetpoint
                ? {
                    capability: 'thermostatSetpoint',
                    command: 'setThermostatSetpoint',
                    value: main.thermostatSetpoint?.thermostatSetpoint?.value,
                    min: main.thermostatSetpoint?.minimumSetpoint?.value,
                    max: main.thermostatSetpoint?.maximumSetpoint?.value,
                }
                : undefined

        const swingContext: SwingContext | undefined = main.fanOscillationMode
            ? {
                capability: 'fanOscillationMode',
                command: 'setFanOscillationMode',
                value: main.fanOscillationMode?.fanOscillationMode?.value,
                supported: main.fanOscillationMode?.supportedFanOscillationModes?.value,
            }
            : main.swingMode
                ? {
                    capability: 'swingMode',
                    command: 'setSwingMode',
                    value: main.swingMode?.swingMode?.value,
                    supported: main.swingMode?.supportedSwingModes?.value,
                }
                : undefined

        const optionalMode: OptionalModeContext | undefined = main.airConditionerOptionalMode
            ? {
                capability: 'airConditionerOptionalMode',
                command: 'setAirConditionerOptionalMode',
                value: main.airConditionerOptionalMode?.airConditionerOptionalMode?.value,
                supported: main.airConditionerOptionalMode?.supportedAcOptionalModes?.value,
            }
            : undefined

        return {
            mode: modeContext,
            temperature: temperatureContext,
            swing: swingContext,
            optionalMode,
            switchState: main.switch?.switch?.value,
        }
    }

    private async updateDeviceState(context: string, settings: DeviceSettingsInterface): Promise<void> {
        const globalSettings = this.plugin.settingsManager.getGlobalSettings<GlobalSettingsInterface>()

        if (!isGlobalSettingsSet(globalSettings) || !settings.deviceId) {
            return
        }

        try {
            const token = globalSettings.accessToken
            const deviceId = settings.deviceId

            const deviceStatus = await fetchApi<DeviceStatus>({
                endpoint: `/devices/${deviceId}/status`,
                method: 'GET',
                accessToken: token,
            })

            // Update image for garage doors
            if ('doorControl' in (deviceStatus.components?.main || {})) {
                const doorValue = deviceStatus.components?.main?.doorControl?.door?.value
                const imageName = doorValue === 'closed' ? 'garage_door_closed' : 'garage_door_open'
                const expectedState = doorValue === 'closed' ? 0 : 1
                console.log(`[Device] Garage door ${deviceId}: doorValue="${doorValue}" -> imageName="${imageName}" -> expectedState=${expectedState}`)
                this.setDeviceImage(context, imageName)
            }
            // Update image for switches and lights
            else if ('switch' in (deviceStatus.components?.main || {})) {
                const switchValue = deviceStatus.components?.main?.switch?.switch?.value
                // Determine if this is a light or a regular switch based on device capabilities
                const hasLightCapability = 'switchLevel' in (deviceStatus.components?.main || {})

                const deviceType = hasLightCapability ? 'light' : 'switch'
                const imageName = `${deviceType}_${switchValue}`
                console.log(`[Device] ${deviceType} ${deviceId}: ${switchValue} -> ${imageName}`)
                this.setDeviceImage(context, imageName)
            }
        } catch (error: any) {
            console.error(`[Device] Error updating device state for ${settings.deviceId}:`, error)

            // Show alert icon if device is offline/unavailable
            if (error.status === 424 || error.status === 503 || error.status === 504) {
                console.warn(`[Device] Device ${settings.deviceId} appears to be offline (HTTP ${error.status})`)
                await this.plugin.setTitle('⚠️ OFFLINE', context)
            }
        }
    }

    private async handleAirConditionerAction({
        behaviour,
        deviceId,
        token,
        deviceStatus,
        settings,
        context,
    }: {
        behaviour: DeviceBehaviour
        deviceId: string
        token: string
        deviceStatus: DeviceStatus
        settings: DeviceSettingsInterface
        context: string
    }): Promise<void> {
        const ac = this.extractAcContext(deviceStatus)

        switch (behaviour) {
            case 'acPower': {
                if (!ac.switchState) {
                    console.warn(`[Device] AC ${deviceId} has no switch capability to toggle power`)
                    return
                }
                const nextPower = ac.switchState === 'on' ? 'off' : 'on'
                await this.sendCommands(deviceId, token, [
                    {
                        capability: 'switch',
                        command: nextPower,
                    },
                ])
                this.setDeviceImage(context, `switch_${nextPower}`)
                return
            }
            case 'acModeCycle': {
                if (!ac.mode) {
                    console.warn(`[Device] AC ${deviceId} has no mode capability to cycle`)
                    return
                }
                const modes = settings.availableModes || ac.mode.supported || []
                const nextMode = this.nextValue(ac.mode.value, modes)
                if (!nextMode) {
                    console.warn(`[Device] No supported modes available to cycle for device ${deviceId}`)
                    return
                }
                await this.sendCommands(deviceId, token, [
                    {
                        capability: ac.mode.capability,
                        command: ac.mode.command,
                        arguments: [nextMode],
                    },
                ])
                await this.plugin.setTitle(nextMode.toUpperCase(), context)
                return
            }
            case 'acModeSet': {
                if (!ac.mode) {
                    console.warn(`[Device] AC ${deviceId} has no mode capability to set`)
                    return
                }
                const targetMode = settings.targetMode || ac.mode.value
                if (!targetMode) {
                    console.warn(`[Device] No target mode provided for AC ${deviceId}`)
                    return
                }
                await this.sendCommands(deviceId, token, [
                    {
                        capability: ac.mode.capability,
                        command: ac.mode.command,
                        arguments: [targetMode],
                    },
                ])
                await this.plugin.setTitle(targetMode.toUpperCase(), context)
                return
            }
            case 'acTempUp':
            case 'acTempDown':
            case 'acSetTemperature': {
                if (!ac.temperature) {
                    console.warn(`[Device] AC ${deviceId} has no temperature capability to adjust`)
                    return
                }
                const step = settings.temperatureStep || 1
                let nextTemp = ac.temperature.value || 0

                if (behaviour === 'acSetTemperature' && settings.targetTemperature !== undefined) {
                    nextTemp = settings.targetTemperature
                }
                if (behaviour === 'acTempUp') {
                    nextTemp = (ac.temperature.value || 0) + step
                }
                if (behaviour === 'acTempDown') {
                    nextTemp = (ac.temperature.value || 0) - step
                }

                if (ac.temperature.min !== undefined) {
                    nextTemp = Math.max(ac.temperature.min, nextTemp)
                }
                if (ac.temperature.max !== undefined) {
                    nextTemp = Math.min(ac.temperature.max, nextTemp)
                }

                await this.sendCommands(deviceId, token, [
                    {
                        capability: ac.temperature.capability,
                        command: ac.temperature.command,
                        arguments: [nextTemp],
                    },
                ])
                await this.plugin.setTitle(`${nextTemp}`, context)
                return
            }
            case 'acSwingVerticalToggle':
            case 'acSwingHorizontalToggle': {
                if (!ac.swing) {
                    console.warn(`[Device] AC ${deviceId} has no swing capability to toggle`)
                    return
                }
                const targetDirection = behaviour === 'acSwingVerticalToggle' ? 'vertical' : 'horizontal'
                const supported = settings.availableSwingModes || ac.swing.supported || []
                const desired = ac.swing.value === targetDirection ? 'fixed' : targetDirection
                const nextSwing = supported.includes(desired) ? desired : supported[0]

                if (!nextSwing) {
                    console.warn(`[Device] No swing modes available for device ${deviceId}`)
                    return
                }

                await this.sendCommands(deviceId, token, [
                    {
                        capability: ac.swing.capability,
                        command: ac.swing.command,
                        arguments: [nextSwing],
                    },
                ])
                return
            }
            case 'acWindFreeToggle': {
                if (!ac.optionalMode) {
                    console.warn(`[Device] AC ${deviceId} has no optional mode capability (WindFree) to toggle`)
                    return
                }
                const supported = ac.optionalMode.supported || []
                const target = supported.includes('windFree') ? 'windFree' : supported[0]
                if (!target) {
                    console.warn(`[Device] No optional modes available for device ${deviceId}`)
                    return
                }
                const nextValue = ac.optionalMode.value === target ? 'off' : target
                await this.sendCommands(deviceId, token, [
                    {
                        capability: ac.optionalMode.capability,
                        command: ac.optionalMode.command,
                        arguments: [nextValue],
                    },
                ])
                return
            }
            default:
                // Fallback to power toggle when behaviour is unknown
                await this.handleAirConditionerAction({
                    behaviour: 'acPower',
                    deviceId,
                    token,
                    deviceStatus,
                    settings,
                    context,
                })
        }
    }

    @SDOnActionEvent('keyUp')
    public async onKeyUp({ context, payload }: KeyUpEvent<DeviceSettingsInterface>): Promise<void> {
        console.log(`[Device] keyUp event - current state: ${payload.state}, deviceId: ${payload.settings.deviceId}`)
        const globalSettings = this.plugin.settingsManager.getGlobalSettings<GlobalSettingsInterface>()

        if (!isGlobalSettingsSet(globalSettings)) {
            return
        }

        const token = globalSettings.accessToken
        const deviceId = payload.settings.deviceId

        try {
            const deviceStatus = await fetchApi<DeviceStatus>({
                endpoint: `/devices/${deviceId}/status`,
                method: 'GET',
                accessToken: token,
            })

            const deviceType: DeviceType = payload.settings.deviceType || detectDeviceType(deviceStatus)
            const behaviour: DeviceBehaviour = payload.settings.behaviour || 'toggle'

            const main = deviceStatus.components?.main
            if (!main) {
                console.warn(`[Device] Device ${deviceId} returned no main component; skipping action`)
                return
            }

            if (deviceType === 'airConditioner' || behaviour.startsWith('ac')) {
                await this.handleAirConditionerAction({
                    behaviour,
                    deviceId,
                    token,
                    deviceStatus,
                    settings: payload.settings,
                    context,
                })
                this.startAggressivePolling(context, payload.settings)
                return
            }

            if (
                main.switch === undefined &&
                main.doorControl === undefined
            ) {
                console.warn('Only switch, garage door, or air conditioner devices are supported at the moment.')
                return
            }

            if ('switch' in main) {
                switch (behaviour) {
                    case 'toggle': {
                        const isActive = main.switch.switch.value === 'on'
                        console.log(`[Device] Toggling switch - current state: ${isActive ? 'on' : 'off'}`)
                        await this.sendCommands(deviceId, token, [
                            {
                                capability: 'switch',
                                command: isActive ? 'off' : 'on',
                            },
                        ])

                        // Update image immediately after toggle
                        const hasLightCapability = 'switchLevel' in main
                        const deviceTypeLabel = hasLightCapability ? 'light' : 'switch'
                        const newValue = isActive ? 'off' : 'on'
                        const imageName = `${deviceTypeLabel}_${newValue}`
                        console.log(`[Device] Toggle ${deviceTypeLabel}: ${isActive ? 'on->off' : 'off->on'} -> ${imageName}`)
                        this.setDeviceImage(context, imageName)
                        break
                    }
                    case 'more': {
                        const nextLevel = ((main.switchLevel.level.value as number) += 10)
                        await this.sendCommands(deviceId, token, [
                            {
                                capability: 'switchLevel',
                                command: 'setLevel',
                                arguments: [nextLevel > 100 ? 100 : nextLevel],
                            },
                        ])
                        break
                    }
                    case 'less': {
                        const prevLevel = ((main.switchLevel.level.value as number) -= 10)
                        await this.sendCommands(deviceId, token, [
                            {
                                capability: 'switchLevel',
                                command: 'setLevel',
                                arguments: [prevLevel < 0 ? 0 : prevLevel],
                            },
                        ])
                        break
                    }
                    default:
                        console.warn(`[Device] Unsupported behaviour ${behaviour} for switch device ${deviceId}`)
                }
            }
            if ('doorControl' in main) {
                const isActive = main.doorControl.door.value === 'open'
                try {
                    await this.sendCommands(deviceId, token, [
                        {
                            capability: 'doorControl',
                            command: isActive ? 'close' : 'open',
                        },
                    ])

                    // Update image immediately after command (will be confirmed by polling)
                    const newValue = isActive ? 'closed' : 'open'
                    const imageName = `garage_door_${newValue}`
                    console.log(`[Device] Toggle garage door: ${isActive ? 'open->closed' : 'closed->open'} -> ${imageName}`)
                    this.setDeviceImage(context, imageName)
                } catch (error: any) {
                    console.error(`[Device] Failed to control garage door ${deviceId}:`, error)
                    if (error.status === 424) {
                        await this.plugin.showAlert(context)
                        await this.plugin.setTitle('⚠️ OFFLINE', context)
                        console.error(`[Device] Garage door ${deviceId} is offline or unavailable (HTTP 424)`)
                    }
                }
            }

            // Start aggressive polling to quickly detect state change
            this.startAggressivePolling(context, payload.settings)
        } catch (error: any) {
            console.error(`[Device] Error in keyUp handler for ${deviceId}:`, error)
            if (error.status === 424 || error.status === 503 || error.status === 504) {
                await this.plugin.showAlert(context)
                await this.plugin.setTitle('⚠️ OFFLINE', context)
            }
        }
    }
}
