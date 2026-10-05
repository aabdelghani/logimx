// A device's settings profiles as the agent applies them: the global one ('default') and one per
// application, which only holds what it changes; anything it leaves alone comes from the global one.

export const profileOf = (d, key) => (((d.config || {}).profiles || {})[key || 'default']) || {};
// what a profile itself sets on a control (undefined: nothing)
export const ownAssignment = (d, section, cid, prof) => section === 'thumbwheel' ? profileOf(d, prof).thumbwheel : ((profileOf(d, prof)[section] || {})[String(cid)]);
// what a control does in a profile, falling back to the global profile
export const assignment = (d, section, cid, prof) => { const v = ownAssignment(d, section, cid, prof); return v === undefined && prof !== 'default' ? ownAssignment(d, section, cid, 'default') : v; };
// set in an app profile (not the global one) on a control: marked on the photo
export const overridden = (d, section, cid, prof) => prof !== 'default' && ownAssignment(d, section, cid, prof) !== undefined;
export const isNative = a => !a || a === 'native';
export const isMouse = d => d && d.kind !== 'keyboard';
