// The Model's way out: every request to the agent (over the main process) and to the main process
// itself goes through here. A failed agent call is reported once, through onError, and still throws.

const cleanError = e => String(e.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

export function createApi(host, onError) {
  async function call(method, params) {
    try { return await host.call(method, params); }
    catch (e) { onError(cleanError(e)); throw e; }
  }
  return {
    call,
    // the same, without reporting: for calls whose failure the caller handles itself
    quiet: (method, params) => host.call(method, params),
    host,
    // A device setting at a path of keys: the agent answers with the device's new state, and the
    // saved settings in the device's config follow the change.
    async setSetting(d, path, value) {
      const st = await call('set_setting', { id: d.id, path, value });
      d.state = st;
      let x = d.config.settings || (d.config.settings = {});
      for (const p of path.slice(0, -1)) { x[p] = x[p] || {}; x = x[p]; }
      x[path[path.length - 1]] = value;
    },
    // What a control does in a profile; answers with the device's new summary.
    setAssignment: (d, section, control, action, profile) => call('set_assignment', { id: d.id, profile, section, control: section === 'thumbwheel' ? '' : String(control), action }),
    setProfiles: (d, profiles) => call('set_profiles', { id: d.id, profiles }),
  };
}
