import {
  type ComponentPublicInstance,
  computed,
  type ComputedRef,
  inject,
  markRaw,
  type MaybeRef,
  onScopeDispose,
  ref,
  type Ref,
} from 'vue'
import {
  orchestratorRegistryKey,
  type OrchestratorStoreObject,
  showHideRegistryKey,
} from '../../utils/keys'
import type {ContainerPosition} from '../../types/Alignment'
import type {
  ComponentController,
  ControllerKey,
  ToastOrchestratorArrayValue,
  ToastOrchestratorCreateParamBase,
} from '../../types'
import {buildController, getOrchestratorControllerId} from '../orchestratorShared'
import {BToast} from '../../components'

const posDefault: ContainerPosition = 'top-end'

export const useToast = () => {
  const orchestratorRegistry = inject(orchestratorRegistryKey, null)
  if (!orchestratorRegistry)
    throw new Error(
      'useToast() must be called within setup(), and BApp, useRegistry or plugin must be installed/provided.'
    )
  const {store, _isToastAppend, _isOrchestratorInstalled} = orchestratorRegistry
  const showHideRegistry = inject(showHideRegistryKey, null)

  /**
   * @returns {ComponentController<typeof BToast, ToastOrchestratorParam>}
   */
  // Uses a `function` declaration (rather than a generic arrow function assigned to a const) so
  // that TypeScript preserves per-call generic inference when `create` is returned as part of
  // `useToast()`'s inferred return object.
  function create<
    ComponentProps extends Record<string, unknown> = Record<string, unknown>,
    T extends ToastOrchestratorCreateParamBase<ComponentProps> =
      ToastOrchestratorCreateParamBase<ComponentProps>,
  >(
    obj: MaybeRef<T> = {} as T
  ): ComponentController<typeof BToast, Ref<ToastOrchestratorArrayValue>> {
    if (!_isOrchestratorInstalled.value)
      throw new Error('The BApp component must be mounted to use the toast composable')

    const toastComp = markRaw(BToast)
    const resolvedProps = ref(obj)
    const toastStore = computed(() => store.value.toast)
    const {htmlAttributeId, storeId} = getOrchestratorControllerId(resolvedProps.value.id)

    const {resolve, controller} = buildController<
      typeof BToast,
      ComputedRef<OrchestratorStoreObject['toast']>
    >(storeId, toastStore)

    const value = computed<ToastOrchestratorArrayValue>({
      get: () => {
        const {component = toastComp, options, slots, ...props} = resolvedProps.value

        return {
          component,
          options,
          slots,
          id: storeId,
          fns: {
            resolve,
            setRef: (v: ComponentPublicInstance) => {
              controller.ref = v
            },
            destroy: controller.destroy,
          },
          props: {
            ...props,
            id: htmlAttributeId,
            position: props.position || posDefault,
          },
        }
      },
      set: (v) => {
        resolvedProps.value = {
          ...resolvedProps.value,
          ...v.props,
        }
      },
    })

    toastStore.value.set(storeId, value)

    onScopeDispose(async () => {
      await controller[Symbol.asyncDispose]()
    }, true)

    return controller
  }

  /**
   * Hides a mounted BToast that registered itself under `id`. Going through the component, rather
   * than through the store, is what lets the trigger flow through the regular hide cycle
   *
   * @returns whether an instance was found
   */
  const hideRegisteredInstance = (id: ControllerKey, trigger?: string): boolean => {
    // The show/hide registry is keyed by the html id, symbols never reach it
    if (typeof id !== 'string') return false
    const instance = showHideRegistry?.values.value.get(id)?.getActive()
    if (!instance) return false
    instance.hide(trigger, true)
    return true
  }

  /**
   * Hides a toast that lives in the orchestrator store. Prefers the mounted instance, falling back
   * to the store entry itself, which also covers toasts that the orchestrator has yet to render
   */
  const hideStoreItem = (item: Ref<ToastOrchestratorArrayValue>, trigger?: string): void => {
    if (hideRegisteredInstance(item.value.props.id ?? item.value.id, trigger)) return
    item.value = {
      ...item.value,
      props: {
        ...item.value.props,
        modelValue: false,
      },
    }
  }

  /**
   * Hide all toasts
   * @param trigger - The trigger to hide all toasts
   */
  const hideAll = (trigger?: string): void => {
    for (const item of store.value.toast.values()) {
      hideStoreItem(item, trigger)
    }
  }

  /**
   * Hide a toast
   * @param trigger - The trigger to hide the toast
   * @param id - The id of the toast to hide, when omitted every toast is hidden
   */
  const hide = (trigger?: string, id?: ControllerKey): void => {
    if (id === undefined) {
      hideAll(trigger)
      return
    }
    const item = store.value.toast.get(id)
    if (item) {
      hideStoreItem(item, trigger)
      return
    }
    // Not created through the composable, it could still be a BToast declared in a template
    hideRegisteredInstance(id, trigger)
  }

  return {
    _isToastAppend,
    _isOrchestratorInstalled,
    store,
    create,
    hide,
    hideAll,
  }
}
