(() => {
  const key = 'mtg-scout.deck-archive.demo.v1';
  window.scoutDemoApi = async (path, options = {}) => {
    let data;
    try { data = JSON.parse(localStorage.getItem(key)) || {events: [], records: []}; }
    catch { throw new Error('无法读取本机演示数据，请检查浏览器存储设置。'); }
    const url = new URL(path, 'https://demo.invalid');
    const post = options.method === 'POST';
    const body = post ? JSON.parse(options.body) : null;
    const save = () => {
      try { localStorage.setItem(key, JSON.stringify(data)); }
      catch { throw new Error('无法保存本机演示数据，浏览器存储可能已满或被禁用。'); }
    };
    if (url.pathname === '/events') {
      if (!post) return {items: data.events};
      const name = String(body.name || '').trim();
      if (!name || name.length > 100) throw new Error('请填写 1–100 字的比赛名称。');
      const existing = data.events.find(event => event.name === name);
      if (existing) return existing;
      const event = {id: crypto.randomUUID(), name, createdAt: new Date().toISOString()};
      data.events.unshift(event); save(); return event;
    }
    if (url.pathname === '/records') {
      if (post) {
        if (!data.events.some(event => event.id === body.eventId)) throw new Error('比赛不存在，请刷新列表。');
        if (!Number.isInteger(body.round) || body.round < 1 || body.round > 99) throw new Error('轮数必须是 1–99 的整数。');
        const record = {...body, id: crypto.randomUUID(), createdAt: new Date().toISOString()};
        data.records.unshift(record); save(); return record;
      }
      const eventId = url.searchParams.get('eventId'), round = url.searchParams.get('round');
      const query = (url.searchParams.get('q') || '').toLocaleLowerCase();
      return {items: data.records.filter(record => record.eventId === eventId &&
        (!round || record.round === Number(round)) &&
        [record.opponent, record.deck, record.notes].some(value => String(value || '').toLocaleLowerCase().includes(query)))};
    }
    throw new Error('本机演示不支持此操作。');
  };
})();
