/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Pirani Connector — Script Trigger RESTlet
 *
 * Allows the webapp to trigger Map/Reduce scripts on demand.
 * The webapp calls this RESTlet via OAuth, and it submits the
 * requested M/R script as a background task.
 *
 * REQUEST (POST JSON body):
 *   action  — Which script to trigger. Currently: "inventory_sync"
 *
 * RESPONSE:
 *   { success: true, taskId: "..." }  or  { error: "..." }
 *
 * SCRIPT PARAMETERS:
 *   custscript_pir_trig_inv_script  — Script ID of the inventory M/R
 *                                      (e.g., "customscript_pir_inv_sync")
 *   custscript_pir_trig_inv_deploy  — Deployment ID of the inventory M/R
 *                                      (e.g., "customdeploy_pir_inv_sync")
 */
define(['N/task', 'N/runtime', 'N/log'], (task, runtime, log) => {

  function post(body) {
    const action = body.action

    if (!action) {
      return { error: 'action is required' }
    }

    if (action === 'inventory_sync') {
      return triggerInventorySync()
    }

    return { error: `Unknown action: ${action}` }
  }

  function triggerInventorySync() {
    const script = runtime.getCurrentScript()
    const scriptId = script.getParameter({ name: 'custscript_pir_trig_inv_script' })
    const deploymentId = script.getParameter({ name: 'custscript_pir_trig_inv_deploy' })

    if (!scriptId) {
      return { error: 'Missing custscript_pir_trig_inv_script parameter' }
    }

    try {
      const mrTask = task.create({
        taskType: task.TaskType.MAP_REDUCE,
        scriptId: scriptId,
        deploymentId: deploymentId || undefined,
      })

      const taskId = mrTask.submit()

      log.audit('PiraniTrigger', `Submitted inventory_sync M/R task: ${taskId} (script=${scriptId}, deploy=${deploymentId})`)

      return {
        success: true,
        taskId: taskId,
        message: `Inventory sync triggered (task ${taskId})`,
      }
    } catch (e) {
      log.error('PiraniTrigger', `Failed to submit inventory_sync: ${e.message}`)
      return {
        error: `Failed to trigger inventory sync: ${e.message}`,
      }
    }
  }

  return {
    post: post,
  }
})
