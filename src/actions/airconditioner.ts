import { AirConditionerSettingsInterface, GlobalSettingsInterface } from '../utils/interface'
import { KeyUpEvent, SDOnActionEvent, StreamDeckAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from 'streamdeck-typescript'
import { fetchApi, isGlobalSettingsSet } from '../utils/index'
import { DeviceStatus } from '@smartthings/core-sdk'
import { Smartthings } from '../smartthings-plugin'

export class AirConditionerAction extends StreamDeckAction<Smartthings, AirConditionerAction> {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map()
  private aggressivePollingTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private readonly POLL_INTERVAL_MS = 5000
  private readonly AGGRESSIVE_POLL_INTERVAL_MS = 500
  private readonly AGGRESSIVE_POLL_DURATION_MS = 10000

  constructor(public plugin: Smartthings, private actionName: string) {
    super(plugin, actionName)
  }

  @SDOnActionEvent('willAppear')
  public async onWillAppear({ context, payload }: WillAppearEvent<AirConditionerSettingsInterface>): Promise<void> {
    await this.updateDeviceState(context, payload.settings)
    this.startPolling(context, payload.settings)
  }

  @SDOnActionEvent('willDisappear')
  public onWillDisappear({ context }: WillDisappearEvent<AirConditionerSettingsInterface>): void {
    this.stopPolling(context)
  }

  @SDOnActionEvent('didReceiveSettings')
  public async onDidReceiveSettings({ context, payload }: DidReceiveSettingsEvent<AirConditionerSettingsInterface>): Promise<void> {
    await this.updateDeviceState(context, payload.settings)
  }

  private startPolling(context: string, settings: AirConditionerSettingsInterface): void {
    this.stopPolling(context)
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

  private startAggressivePolling(context: string, settings: AirConditionerSettingsInterface): void {
    this.stopAggressivePolling(context)
    this.stopPolling(context)

    const aggressiveInterval = setInterval(async () => {
      await this.updateDeviceState(context, settings)
    }, this.AGGRESSIVE_POLL_INTERVAL_MS)

    this.pollingIntervals.set(context, aggressiveInterval)

    const timeout = setTimeout(() => {
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

  private async updateDeviceState(context: string, settings: AirConditionerSettingsInterface): Promise<void> {
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

      // Update state based on switch status
      if ('switch' in (deviceStatus.components?.main || {})) {
        const switchValue = deviceStatus.components?.main?.switch?.switch?.value
        const state = switchValue === 'on' ? 1 : 0
        this.plugin.setState(state, context)

        // Update title with current mode and temperature
        if (settings.controlType === 'power') {
          let title = switchValue === 'on' ? 'ON' : 'OFF'

          if (switchValue === 'on' && 'airConditionerMode' in (deviceStatus.components?.main || {})) {
            const mode = deviceStatus.components?.main?.airConditionerMode?.airConditionerMode?.value
            const temp = deviceStatus.components?.main?.thermostatCoolingSetpoint?.value

            if (mode && typeof mode === 'string') {
              title = `${mode.toUpperCase()}`
              if (temp && typeof temp === 'number') {
                title += `\n${temp}°C`
              }
            }
          }

          await this.plugin.setTitle(title, context)
        }
      }
    } catch (error: any) {
      console.error(`[AirConditioner] Error updating device state for ${settings.deviceId}:`, error)

      if (error.status === 424 || error.status === 503 || error.status === 504) {
        console.warn(`[AirConditioner] Device ${settings.deviceId} appears to be offline (HTTP ${error.status})`)
        await this.plugin.setTitle('⚠️ OFFLINE', context)
      }
    }
  }

  @SDOnActionEvent('keyUp')
  public async onKeyUp({ context, payload }: KeyUpEvent<AirConditionerSettingsInterface>): Promise<void> {
    const globalSettings = this.plugin.settingsManager.getGlobalSettings<GlobalSettingsInterface>()

    if (!isGlobalSettingsSet(globalSettings)) {
      return
    }

    const token = globalSettings.accessToken
    const deviceId = payload.settings.deviceId
    const controlType = payload.settings.controlType || 'power'

    try {
      const deviceStatus = await fetchApi<DeviceStatus>({
        endpoint: `/devices/${deviceId}/status`,
        method: 'GET',
        accessToken: token,
      })

      switch (controlType) {
        case 'power':
          // Toggle power
          if (deviceStatus.components?.main && 'switch' in deviceStatus.components.main) {
            const isActive = deviceStatus.components.main.switch?.switch?.value === 'on'
            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'switch',
                  command: isActive ? 'off' : 'on',
                },
              ]),
            })
          }
          break

        case 'mode':
          // Cycle through modes: cool -> heat -> fan -> dry -> auto
          if (deviceStatus.components?.main && 'airConditionerMode' in deviceStatus.components.main) {
            const currentMode = deviceStatus.components.main.airConditionerMode?.airConditionerMode?.value
            const modes = ['cool', 'heat', 'fanOnly', 'dry', 'auto']
            const currentIndex = modes.indexOf(currentMode as string)
            const nextMode = modes[(currentIndex + 1) % modes.length]

            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'airConditionerMode',
                  command: 'setAirConditionerMode',
                  arguments: [nextMode],
                },
              ]),
            })

            await this.plugin.setTitle(nextMode.toUpperCase(), context)
          }
          break

        case 'temp_up':
          // Increase temperature
          if (deviceStatus.components?.main && 'thermostatCoolingSetpoint' in deviceStatus.components.main) {
            const currentTemp = deviceStatus.components.main.thermostatCoolingSetpoint?.value as number
            const newTemp = Math.min(currentTemp + 1, 30) // Max 30°C

            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'thermostatCoolingSetpoint',
                  command: 'setCoolingSetpoint',
                  arguments: [newTemp],
                },
              ]),
            })

            await this.plugin.setTitle(`${newTemp}°C`, context)
          }
          break

        case 'temp_down':
          // Decrease temperature
          if (deviceStatus.components?.main && 'thermostatCoolingSetpoint' in deviceStatus.components.main) {
            const currentTemp = deviceStatus.components.main.thermostatCoolingSetpoint?.value as number
            const newTemp = Math.max(currentTemp - 1, 16) // Min 16°C

            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'thermostatCoolingSetpoint',
                  command: 'setCoolingSetpoint',
                  arguments: [newTemp],
                },
              ]),
            })

            await this.plugin.setTitle(`${newTemp}°C`, context)
          }
          break

        case 'fan_mode':
          // Cycle through fan modes
          if (deviceStatus.components?.main && 'airConditionerFanMode' in deviceStatus.components.main) {
            const currentFanMode = deviceStatus.components.main.airConditionerFanMode?.fanMode?.value
            const fanModes = ['auto', 'low', 'medium', 'high', 'turbo']
            const currentIndex = fanModes.indexOf(currentFanMode as string)
            const nextFanMode = fanModes[(currentIndex + 1) % fanModes.length]

            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'airConditionerFanMode',
                  command: 'setFanMode',
                  arguments: [nextFanMode],
                },
              ]),
            })

            await this.plugin.setTitle(`FAN\n${nextFanMode.toUpperCase()}`, context)
          }
          break

        case 'swing_vertical':
          // Toggle vertical swing
          if (deviceStatus.components?.main && 'fanOscillationMode' in deviceStatus.components.main) {
            const currentSwing = deviceStatus.components.main.fanOscillationMode?.fanOscillationMode?.value
            const newSwing = currentSwing === 'vertical' ? 'fixed' : 'vertical'

            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'fanOscillationMode',
                  command: 'setFanOscillationMode',
                  arguments: [newSwing],
                },
              ]),
            })

            await this.plugin.setTitle(`SWING\n${newSwing.toUpperCase()}`, context)
          }
          break

        case 'swing_horizontal':
          // Toggle horizontal swing (some models support this)
          if (deviceStatus.components?.main && 'custom.airConditionerOptionalMode' in deviceStatus.components.main) {
            // This is model-specific, adjust as needed
            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'execute',
                  command: 'execute',
                  arguments: ['/mode/vs', { 'x.com.samsung.da.options': ['Wind_Horizontal'] }],
                },
              ]),
            })
          }
          break

        case 'windfree':
          // Toggle WindFree mode (Samsung specific feature)
          if (deviceStatus.components?.main && 'custom.airConditionerOptionalMode' in deviceStatus.components.main) {
            const currentOptions = (deviceStatus.components.main['custom.airConditionerOptionalMode']?.acOptionalMode?.value || []) as string[]
            const hasWindFree = Array.isArray(currentOptions) && currentOptions.includes('windFree')

            await fetchApi({
              endpoint: `/devices/${deviceId}/commands`,
              method: 'POST',
              accessToken: token,
              body: JSON.stringify([
                {
                  capability: 'custom.airConditionerOptionalMode',
                  command: 'setAcOptionalMode',
                  arguments: [hasWindFree ? [] : ['windFree']],
                },
              ]),
            })

            await this.plugin.setTitle(hasWindFree ? 'NORMAL' : 'WINDFREE', context)
          }
          break
      }

      // Start aggressive polling to quickly detect state change
      this.startAggressivePolling(context, payload.settings)
    } catch (error: any) {
      console.error(`[AirConditioner] Error in keyUp handler for ${deviceId}:`, error)
      if (error.status === 424 || error.status === 503 || error.status === 504) {
        await this.plugin.showAlert(context)
        await this.plugin.setTitle('⚠️ OFFLINE', context)
      }
    }
  }
}
