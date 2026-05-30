class AIService {
    constructor() {
        this.baseUrl = localStorage.getItem('ai_base_url') || 'https://api.openai.com/v1';
        this.apiKey = localStorage.getItem('ai_api_key') || '';
        this.model = localStorage.getItem('ai_model') || 'gpt-3.5-turbo';
    }

    updateConfig(baseUrl, apiKey, model) {
        this.baseUrl = baseUrl || 'https://api.openai.com/v1';
        this.apiKey = apiKey;
        this.model = model || 'gpt-3.5-turbo';
        localStorage.setItem('ai_base_url', this.baseUrl);
        localStorage.setItem('ai_api_key', this.apiKey);
        localStorage.setItem('ai_model', this.model);
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
                    temperature: 0.7
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
