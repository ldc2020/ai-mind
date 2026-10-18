/** 统一访问本项目 API；只有服务端确认成功，调用方才可清除未保存状态。 */
async function apiFetch(path, options) {
    const response = await fetch(APP_CONFIG.api.basePath.replace(/\/$/, '') + path, options);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `请求失败（HTTP ${response.status}）`);
    }
    return response;
}
