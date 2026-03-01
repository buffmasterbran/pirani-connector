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
    log.audit('PiraniTrigger', '========== RESTlet POST called ==========')
    log.audit('PiraniTrigger', `Raw body received: ${JSON.stringify(body)}`)
    log.audit('PiraniTrigger', `Body type: ${typeof body}`)

    const action = body.action
    log.audit('PiraniTrigger', `Action: ${action || '(empty/undefined)'}`)

    if (!action) {
      log.error('PiraniTrigger', 'ABORTING: No action provided in request body')
      return { error: 'action is required' }
    }

    if (action === 'inventory_sync') {
      log.audit('PiraniTrigger', 'Routing to triggerInventorySync()...')
      return triggerInventorySync()
    }

    log.error('PiraniTrigger', `ABORTING: Unknown action "${action}"`)
    return { error: `Unknown action: ${action}` }
  }

  function triggerInventorySync() {
    const script = runtime.getCurrentScript()

    // Log ALL script parameters we can find
    log.audit('PiraniTrigger', `Current script ID: ${script.id}`)
    log.audit('PiraniTrigger', `Current deployment ID: ${script.deploymentId}`)
    log.audit('PiraniTrigger', `Remaining governance: ${script.getRemainingUsage()}`)

    const scriptId = script.getParameter({ name: 'custscript_pir_trig_inv_script' })
    const deploymentId = script.getParameter({ name: 'custscript_pir_trig_inv_deploy' })

    log.audit('PiraniTrigger', `Parameter custscript_pir_trig_inv_script = "${scriptId}" (type: ${typeof scriptId})`)
    log.audit('PiraniTrigger', `Parameter custscript_pir_trig_inv_deploy = "${deploymentId}" (type: ${typeof deploymentId})`)

    if (!scriptId) {
      log.error('PiraniTrigger', `ABORTING: custscript_pir_trig_inv_script is empty/null/undefined. Check that this parameter is defined on the SCRIPT record (not just the deployment) and has a value set on the deployment.`)
      return { error: 'Missing custscript_pir_trig_inv_script parameter — check Script record Parameters tab and Deployment values' }
    }

    log.audit('PiraniTrigger', `Attempting to create M/R task: taskType=MAP_REDUCE, scriptId="${scriptId}", deploymentId="${deploymentId || '(auto)'}"`)

    try {
      const mrTask = task.create({
        taskType: task.TaskType.MAP_REDUCE,
        scriptId: scriptId,
        deploymentId: deploymentId || undefined,
      })

      log.audit('PiraniTrigger', `M/R task created OK, submitting...`)
      const taskId = mrTask.submit()

      log.audit('PiraniTrigger', `SUCCESS: M/R task submitted. taskId=${taskId}, scriptId=${scriptId}, deploymentId=${deploymentId}`)

      return {
        success: true,
        taskId: taskId,
        message: `Inventory sync triggered (task ${taskId})`,
      }
    } catch (e) {
      log.error('PiraniTrigger', `FAILED to submit M/R task`)
      log.error('PiraniTrigger', `  Error name: ${e.name}`)
      log.error('PiraniTrigger', `  Error message: ${e.message}`)
      log.error('PiraniTrigger', `  Error type: ${e.type || 'N/A'}`)
      log.error('PiraniTrigger', `  scriptId used: "${scriptId}"`)
      log.error('PiraniTrigger', `  deploymentId used: "${deploymentId}"`)
      log.error('PiraniTrigger', `  Full error: ${JSON.stringify(e)}`)
      return {
        error: `Failed to trigger inventory sync: ${e.message}`,
      }
    }
  }

  return {
    post: post,
  }
})
