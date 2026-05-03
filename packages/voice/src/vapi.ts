/**
 * Thin client for Vapi's REST API — only the endpoints we need to push
 * an assistant configuration up. We don't try to abstract the whole API;
 * if Vapi adds something we want, add a method here.
 *
 * Reference: https://docs.vapi.ai/api-reference/assistants/update-assistant
 */

const BASE = "https://api.vapi.ai";

export class VapiClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("VAPI_API_KEY is required");
  }

  async getAssistant(assistantId: string): Promise<unknown> {
    return this.request("GET", `/assistant/${assistantId}`);
  }

  async updateAssistant(assistantId: string, config: unknown): Promise<unknown> {
    return this.request("PATCH", `/assistant/${assistantId}`, config);
  }

  async listPhoneNumbers(): Promise<Array<{ id: string; number?: string; assistantId?: string }>> {
    return this.request("GET", "/phone-number") as Promise<
      Array<{ id: string; number?: string; assistantId?: string }>
    >;
  }

  async assignPhoneToAssistant(phoneId: string, assistantId: string): Promise<unknown> {
    return this.request("PATCH", `/phone-number/${phoneId}`, { assistantId });
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Vapi ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : null;
  }
}
