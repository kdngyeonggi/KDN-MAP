function valid(view) {
  return view && Number.isFinite(view.lat) && Math.abs(view.lat) <= 90 &&
    Number.isFinite(view.lng) && Math.abs(view.lng) <= 180 &&
    Number.isInteger(view.level) && view.level >= 1 && view.level <= 30;
}

export function createWorkerViewport({ read, write, key, capture, restore }) {
  let activeKey = null;
  let last;
  function readView(target) {
    if (!target) return null;
    try {
      const view = JSON.parse(read(target));
      return valid(view) ? view : null;
    } catch {
      return null;
    }
  }
  return {
    read: readView,
    seed(target) {
      activeKey = target;
    },
    select(target) {
      if (target === activeKey) return;
      activeKey = target;
      last = undefined;
      const view = readView(target);
      if (view) restore(view);
    },
    save() {
      if (!activeKey || key() !== activeKey) return;
      const view = capture();
      if (!valid(view)) return;
      const value = JSON.stringify(view);
      if (value === last) return;
      try {
        write(activeKey, value);
        last = value;
      } catch {
        // Private browsing or unavailable storage should not interrupt the map.
      }
    }
  };
}
