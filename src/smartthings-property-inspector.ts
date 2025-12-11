import {
    SDOnPiEvent,
    StreamDeckPropertyInspectorHandler,
    DidReceiveSettingsEvent,
} from 'streamdeck-typescript'
import {
    isGlobalSettingsSet,
    fetchApi,
    addSelectOption,
    SelectElement,
    isDeviceSetting,
    isSceneSetting,
    detectDeviceType,
    formatDeviceLabel,
    summarizeAcSupport,
} from './utils/index'
import {
    AirConditionerSettings,
    DeviceBehaviour,
    DeviceSettingsInterface,
    DeviceType,
    GlobalSettingsInterface,
    SceneSettingsInterface,
} from './utils/interface'
import { PagedResult, SceneSummary, DeviceList, DeviceStatus } from '@smartthings/core-sdk'

const pluginName = 'com.thibautsabot.streamdeck'

type BehaviourOption = {
    value: DeviceBehaviour
    label: string
    requiresMode?: boolean
    requiresTargetTemperature?: boolean
    usesStep?: boolean
}

const DEFAULT_STEP = 1

const AC_BEHAVIOURS: BehaviourOption[] = [
    { value: 'acPower', label: 'Power toggle' },
    { value: 'acModeCycle', label: 'Mode: next available' },
    { value: 'acModeSet', label: 'Mode: set specific', requiresMode: true },
    { value: 'acTempUp', label: 'Temperature +', usesStep: true },
    { value: 'acTempDown', label: 'Temperature -', usesStep: true },
    { value: 'acSetTemperature', label: 'Temperature: set value', requiresTargetTemperature: true },
    { value: 'acSwingVerticalToggle', label: 'Swing vertical toggle' },
    { value: 'acSwingHorizontalToggle', label: 'Swing horizontal toggle' },
    { value: 'acWindFreeToggle', label: 'WindFree toggle' },
]

const LIGHT_BEHAVIOURS: BehaviourOption[] = [
    { value: 'toggle', label: 'On / Off' },
    { value: 'more', label: 'Brighter (+10%)' },
    { value: 'less', label: 'Darker (-10%)' },
]

const SWITCH_BEHAVIOURS: BehaviourOption[] = [{ value: 'toggle', label: 'On / Off' }]

class SmartthingsPI extends StreamDeckPropertyInspectorHandler {
    private selectOptions?: SelectElement[]
    private selectedBehaviour: DeviceBehaviour = 'toggle'
    private selectedOptionId: string
    private deviceTypeForSelection: DeviceType = 'unknown'
    private acSupportForSelection: AirConditionerSettings = {}

    private behaviourRow?: HTMLDivElement
    private behaviourSelect?: HTMLSelectElement
    private modeRow?: HTMLDivElement
    private modeSelect?: HTMLSelectElement
    private tempRow?: HTMLDivElement
    private tempInput?: HTMLInputElement
    private tempStepRow?: HTMLDivElement
    private tempStepInput?: HTMLInputElement
    private capabilityHintRow?: HTMLDivElement
    private capabilityHint?: HTMLDivElement

    constructor() {
        super()
    }

    @SDOnPiEvent('documentLoaded')
    onDocumentLoaded(): void {
        const validateButton = document.getElementById('validate_button') as HTMLButtonElement
        const selectLabel = document.getElementById('select_label') as HTMLDivElement
        const select = document.getElementById('select_value') as HTMLSelectElement

        this.behaviourRow = document.getElementById('behaviour_row') as HTMLDivElement
        this.behaviourSelect = document.getElementById('behaviour_select') as HTMLSelectElement
        this.modeRow = document.getElementById('ac_mode_row') as HTMLDivElement
        this.modeSelect = document.getElementById('ac_mode_value') as HTMLSelectElement
        this.tempRow = document.getElementById('ac_temperature_row') as HTMLDivElement
        this.tempInput = document.getElementById('ac_temperature_value') as HTMLInputElement
        this.tempStepRow = document.getElementById('ac_temperature_step_row') as HTMLDivElement
        this.tempStepInput = document.getElementById('ac_temperature_step_value') as HTMLInputElement
        this.capabilityHintRow = document.getElementById('device_capabilities_row') as HTMLDivElement
        this.capabilityHint = document.getElementById('device_capabilities_hint') as HTMLDivElement

        validateButton?.addEventListener('click', this.onValidateButtonPressed.bind(this))
        select?.addEventListener('change', this.onSelectChanged.bind(this))
        this.behaviourSelect?.addEventListener('change', this.onBehaviourChanged.bind(this))
        this.modeSelect?.addEventListener('change', this.onModeChanged.bind(this))
        this.tempInput?.addEventListener('change', this.onTemperatureChanged.bind(this))
        this.tempStepInput?.addEventListener('change', this.onTemperatureStepChanged.bind(this))

        switch (this.actionInfo.action) {
            case pluginName + '.device':
            case pluginName + '.light':
            case pluginName + '.switch':
            case pluginName + '.garagedoor': {
                selectLabel.textContent = 'Devices'
                validateButton.textContent = 'Fetch devices list'
                addSelectOption({ select: select, element: { id: 'none', name: 'No device' } })
                this.behaviourRow?.classList.remove('hidden')
                break
            }
            case pluginName + '.scene': {
                validateButton.textContent = 'Fetch scenes list'
                selectLabel.textContent = 'Scenes'
                addSelectOption({ select: select, element: { id: 'none', name: 'No scene' } })
                this.behaviourRow?.classList.add('hidden')
                break
            }
            default:
                this.behaviourRow?.classList.add('hidden')
        }

        if (this.tempStepInput) {
            this.tempStepInput.value = DEFAULT_STEP.toString()
        }
    }

    private behaviourOptionsFor(type: DeviceType): BehaviourOption[] {
        if (type === 'light') {
            return [...LIGHT_BEHAVIOURS]
        }
        if (type === 'airConditioner') {
            return [...SWITCH_BEHAVIOURS, ...AC_BEHAVIOURS]
        }
        return [...SWITCH_BEHAVIOURS]
    }

    private renderBehaviourOptions(deviceType: DeviceType, desired?: DeviceBehaviour) {
        if (!this.behaviourSelect) {
            return
        }
        const options = this.behaviourOptionsFor(deviceType)
        this.behaviourSelect.length = 0
        options.forEach((opt) => {
            const option = document.createElement('option')
            option.value = opt.value
            option.text = opt.label
            this.behaviourSelect?.add(option)
        })

        const selected = options.find((opt) => opt.value === desired) || options[0]
        this.selectedBehaviour = selected.value
        this.behaviourSelect.value = selected.value
        this.toggleAcFields()
    }

    private toggleAcFields() {
        const currentOption = this.behaviourOptionsFor(this.deviceTypeForSelection).find(
            (opt) => opt.value === this.selectedBehaviour
        )
        const isAc = this.deviceTypeForSelection === 'airConditioner'
        this.modeRow?.classList.toggle('hidden', !(isAc && currentOption?.requiresMode))
        this.tempRow?.classList.toggle('hidden', !(isAc && currentOption?.requiresTargetTemperature))
        this.tempStepRow?.classList.toggle('hidden', !(isAc && currentOption?.usesStep))

        if (this.capabilityHintRow && this.capabilityHint) {
            if (isAc) {
                const modes = this.acSupportForSelection.availableModes?.join(', ') || '—'
                const swing = this.acSupportForSelection.availableSwingModes?.join(', ') || '—'
                const windFree = this.acSupportForSelection.supportsWindFree ? 'WindFree ✓' : 'WindFree —'
                this.capabilityHint.textContent = `Modes: ${modes} · Swing: ${swing} · ${windFree}`
                this.capabilityHintRow.classList.remove('hidden')
            } else {
                this.capabilityHint.textContent = ''
                this.capabilityHintRow.classList.add('hidden')
            }
        }
    }

    private populateModesSelect(modes?: string[]) {
        if (!this.modeSelect) return
        this.modeSelect.length = 0
        if (modes && modes.length > 0) {
            modes.forEach((mode) => addSelectOption({ select: this.modeSelect!, element: { id: mode, name: mode } }))
        }
    }

    private async fetchDeviceSummaries(accessToken: string): Promise<SelectElement[]> {
        const res = await fetchApi<DeviceList>({
            endpoint: '/devices',
            method: 'GET',
            accessToken,
        })

        const itemsWithType = await Promise.all(
            res.items.map(async (item) => {
                try {
                    const status = await fetchApi<DeviceStatus>({
                        endpoint: `/devices/${item.deviceId}/status`,
                        method: 'GET',
                        accessToken,
                    })
                    const deviceType = detectDeviceType(status)
                    const label = item.label || (item as any).name || item.deviceId || 'Unknown device'
                    return {
                        id: item.deviceId,
                        name: formatDeviceLabel(label, deviceType),
                        deviceType,
                    } as SelectElement
                } catch (error) {
                    console.warn(`[PI] Failed to fetch status for device ${item.deviceId}`, error)
                    return {
                        id: item.deviceId,
                        name: formatDeviceLabel(item.label || item.deviceId || 'Unknown device', 'unknown'),
                        deviceType: 'unknown',
                    } as SelectElement
                }
            })
        )

        return itemsWithType
    }

    private getAccessToken(): string | undefined {
        const fromInput = (document.getElementById('accesstoken') as HTMLInputElement)?.value
        if (fromInput) return fromInput

        const globalSettings = this.settingsManager.getGlobalSettings<GlobalSettingsInterface>()
        if (isGlobalSettingsSet(globalSettings)) {
            return globalSettings.accessToken
        }

        return undefined
    }

    private async loadSelectedDeviceCapabilities(deviceId: string) {
        const accessToken = this.getAccessToken()
        if (!accessToken || !deviceId || deviceId === 'none') {
            return
        }

        try {
            const status = await fetchApi<DeviceStatus>({
                endpoint: `/devices/${deviceId}/status`,
                method: 'GET',
                accessToken,
            })
            this.deviceTypeForSelection = detectDeviceType(status)
            this.acSupportForSelection = summarizeAcSupport(status)

            this.populateModesSelect(this.acSupportForSelection.availableModes)
            this.renderBehaviourOptions(this.deviceTypeForSelection, this.selectedBehaviour)
            this.toggleAcFields()

            this.setSettings<DeviceSettingsInterface>({
                selectOptions: this.selectOptions,
                deviceId: this.selectedOptionId,
                behaviour: this.selectedBehaviour,
                deviceType: this.deviceTypeForSelection,
                ...this.acSupportForSelection,
                targetMode: this.modeSelect?.value,
                targetTemperature: this.tempInput?.valueAsNumber,
                temperatureStep: this.tempStepInput?.valueAsNumber || DEFAULT_STEP,
            })
        } catch (error) {
            console.warn(`[PI] Failed to load capabilities for device ${deviceId}`, error)
        }
    }

    private async onValidateButtonPressed() {
        const accessToken = (<HTMLInputElement>document.getElementById('accesstoken'))?.value
        if (!accessToken) {
            alert('Informe o token de acesso do SmartThings antes de buscar os dispositivos.')
            return
        }

        this.settingsManager.setGlobalSettings<GlobalSettingsInterface>({ accessToken })

        let elements: SelectElement[] = []

        try {
            switch (this.actionInfo.action) {
                case pluginName + '.scene': {
                    const res = await fetchApi<PagedResult<SceneSummary>>({
                        endpoint: '/scenes',
                        method: 'GET',
                        accessToken,
                    })
                    elements = res.items.map((item) => ({
                        id: item.sceneId,
                        name: item.sceneName,
                    }))
                    break
                }
                case pluginName + '.device':
                case pluginName + '.light':
                case pluginName + '.switch':
                case pluginName + '.garagedoor': {
                    elements = await this.fetchDeviceSummaries(accessToken)
                    break
                }
            }
        } catch (error: any) {
            console.error('[PI] Failed to fetch list', error)
            alert('Não foi possível listar. Verifique se o token é válido e tem permissão de "Devices".')
            elements = []
        }

        this.setSettings({
            selectOptions: elements,
            behaviour: this.selectedBehaviour,
        })
        this.requestSettings() // requestSettings will add the options to the select element
    }

    public async onSelectChanged(e: Event) {
        const newSelection = (e.target as HTMLSelectElement).value
        this.selectedOptionId = newSelection
        const select = document.getElementById('select_value') as HTMLSelectElement

        const selected = this.selectOptions?.find((element) => element.id === newSelection)
        this.deviceTypeForSelection = selected?.deviceType || 'unknown'
        this.acSupportForSelection = {}

        this.renderBehaviourOptions(this.deviceTypeForSelection, this.selectedBehaviour)
        this.populateModesSelect(this.acSupportForSelection.availableModes)

        switch (this.actionInfo.action) {
            case pluginName + '.scene': {
                this.setSettings<SceneSettingsInterface>({
                    selectOptions: this.selectOptions,
                    sceneId: newSelection,
                })
                break
            }
            case pluginName + '.device':
            case pluginName + '.light':
            case pluginName + '.switch':
            case pluginName + '.garagedoor': {
                this.setSettings<DeviceSettingsInterface>({
                    selectOptions: this.selectOptions,
                    deviceId: newSelection,
                    behaviour: this.selectedBehaviour,
                    deviceType: this.deviceTypeForSelection,
                    targetMode: this.modeSelect?.value,
                    targetTemperature: this.tempInput?.valueAsNumber,
                    temperatureStep: this.tempStepInput?.valueAsNumber || DEFAULT_STEP,
                })
                break
            }
        }

        const selectedIndex = this.selectOptions?.findIndex((element) => element.id === newSelection) ?? -1
        select.selectedIndex = selectedIndex >= 0 ? selectedIndex + 1 : 0

        await this.loadSelectedDeviceCapabilities(newSelection)
    }

    private onBehaviourChanged(e: Event) {
        const newSelection = (e.target as HTMLSelectElement).value as DeviceBehaviour
        this.selectedBehaviour = newSelection
        this.toggleAcFields()

        this.setSettings<DeviceSettingsInterface>({
            selectOptions: this.selectOptions,
            deviceId: this.selectedOptionId,
            behaviour: newSelection,
            deviceType: this.deviceTypeForSelection,
            ...this.acSupportForSelection,
            targetMode: this.modeSelect?.value,
            targetTemperature: this.tempInput?.valueAsNumber,
            temperatureStep: this.tempStepInput?.valueAsNumber || DEFAULT_STEP,
        })
    }

    private onModeChanged(e: Event) {
        const mode = (e.target as HTMLSelectElement).value
        this.setSettings<DeviceSettingsInterface>({
            selectOptions: this.selectOptions,
            deviceId: this.selectedOptionId,
            behaviour: this.selectedBehaviour,
            deviceType: this.deviceTypeForSelection,
            ...this.acSupportForSelection,
            targetMode: mode,
            targetTemperature: this.tempInput?.valueAsNumber,
            temperatureStep: this.tempStepInput?.valueAsNumber || DEFAULT_STEP,
        })
    }

    private onTemperatureChanged(e: Event) {
        const targetTemperature = (e.target as HTMLInputElement).valueAsNumber
        this.setSettings<DeviceSettingsInterface>({
            selectOptions: this.selectOptions,
            deviceId: this.selectedOptionId,
            behaviour: this.selectedBehaviour,
            deviceType: this.deviceTypeForSelection,
            ...this.acSupportForSelection,
            targetMode: this.modeSelect?.value,
            targetTemperature,
            temperatureStep: this.tempStepInput?.valueAsNumber || DEFAULT_STEP,
        })
    }

    private onTemperatureStepChanged(e: Event) {
        const temperatureStep = (e.target as HTMLInputElement).valueAsNumber || DEFAULT_STEP
        this.setSettings<DeviceSettingsInterface>({
            selectOptions: this.selectOptions,
            deviceId: this.selectedOptionId,
            behaviour: this.selectedBehaviour,
            deviceType: this.deviceTypeForSelection,
            ...this.acSupportForSelection,
            targetMode: this.modeSelect?.value,
            targetTemperature: this.tempInput?.valueAsNumber,
            temperatureStep,
        })
    }

    // Prefill PI elements from cache
    @SDOnPiEvent('globalSettingsAvailable')
    propertyInspectorDidAppear(): void {
        this.requestSettings()
        const globalSettings = this.settingsManager.getGlobalSettings<GlobalSettingsInterface>()

        if (isGlobalSettingsSet(globalSettings)) {
            const accessToken = globalSettings.accessToken
            if (accessToken) {
                ; (<HTMLInputElement>document.getElementById('accesstoken')).value = accessToken
            }
        }
    }

    // Get the devices list from cache
    @SDOnPiEvent('didReceiveSettings')
    onReceiveSettings({
        payload,
    }: DidReceiveSettingsEvent<DeviceSettingsInterface | SceneSettingsInterface>): void {
        const select = document.getElementById('select_value') as HTMLSelectElement
        this.selectOptions = payload.settings.selectOptions
        select.length = 1 // Only keep the "No element" option
        this.selectOptions?.forEach((element) => addSelectOption({ select, element }))

        let activeIndex: number | undefined
        if (isDeviceSetting(payload.settings)) {
            const deviceId = payload.settings.deviceId
            this.selectedOptionId = deviceId

            this.selectedBehaviour = (payload.settings as DeviceSettingsInterface).behaviour || 'toggle'
            this.deviceTypeForSelection = (payload.settings as DeviceSettingsInterface).deviceType || 'unknown'
            this.acSupportForSelection = {
                availableModes: (payload.settings as DeviceSettingsInterface).availableModes,
                availableSwingModes: (payload.settings as DeviceSettingsInterface).availableSwingModes,
                supportsWindFree: (payload.settings as DeviceSettingsInterface).supportsWindFree,
                minTemperature: (payload.settings as DeviceSettingsInterface).minTemperature,
                maxTemperature: (payload.settings as DeviceSettingsInterface).maxTemperature,
                temperatureUnit: (payload.settings as DeviceSettingsInterface).temperatureUnit,
            }
            this.renderBehaviourOptions(this.deviceTypeForSelection, this.selectedBehaviour)
            this.populateModesSelect(this.acSupportForSelection.availableModes)
            if (this.tempInput) {
                const tempSetting = (payload.settings as DeviceSettingsInterface).targetTemperature
                if (tempSetting !== undefined) this.tempInput.value = tempSetting.toString()
            }
            if (this.tempStepInput) {
                const stepSetting = (payload.settings as DeviceSettingsInterface).temperatureStep || DEFAULT_STEP
                this.tempStepInput.value = stepSetting.toString()
            }
            activeIndex = this.selectOptions?.findIndex((element) => element.id === deviceId) || 0
        }
        if (isSceneSetting(payload.settings)) {
            const sceneId = (payload.settings as SceneSettingsInterface).sceneId
            activeIndex = this.selectOptions?.findIndex((element) => element.id === sceneId) || 0

            this.selectedOptionId = sceneId
        }
        select.selectedIndex = activeIndex !== undefined ? activeIndex + 1 : 0 // + 1 because of the "No element" first option
        this.toggleAcFields()
    }
}

new SmartthingsPI()
