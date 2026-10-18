class AIService {
    constructor() {
        this.baseUrl = localStorage.getItem(APP_CONFIG.storageKeys.aiBaseUrl) || APP_CONFIG.ai.baseUrl;
        this.apiKey = localStorage.getItem(APP_CONFIG.storageKeys.aiApiKey) || '';
        this.model = localStorage.getItem(APP_CONFIG.storageKeys.aiModel) || APP_CONFIG.ai.model;
    }

    updateConfig(baseUrl, apiKey, model) {
        this.baseUrl = baseUrl || APP_CONFIG.ai.baseUrl;
        this.apiKey = apiKey;
        this.model = model || APP_CONFIG.ai.model;
        localStorage.setItem(APP_CONFIG.storageKeys.aiBaseUrl, this.baseUrl);
        localStorage.setItem(APP_CONFIG.storageKeys.aiApiKey, this.apiKey);
        localStorage.setItem(APP_CONFIG.storageKeys.aiModel, this.model);
    }

    getConfig() {
        return {
            baseUrl: this.baseUrl,
            apiKey: this.apiKey,
            model: this.model
        };
    }

    async chatCompletion(systemPrompt, userMessage, signal) {
        if (!this.apiKey) {
            throw new Error('未设置 AI API Key，请先在左下角设置中配置。');
        }

        const url = this.baseUrl.endsWith('/') ? `${this.baseUrl}chat/completions` : `${this.baseUrl}/chat/completions`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: APP_CONFIG.ai.temperature
                }),
                signal: signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `HTTP Error ${response.status}`);
            }

            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                return data.choices[0].message.content;
            } else {
                throw new Error('AI 返回数据格式异常');
            }
        } catch (error) {
            console.error('AI 调用失败:', error);
            throw error;
        }
    }
}

window.aiService = new AIService();
