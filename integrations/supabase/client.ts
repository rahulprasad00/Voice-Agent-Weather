type InvokeResponse<T = unknown> = {
  data: T | null;
  error: Error | null;
};

/**
 * Stub Supabase client to avoid build-time import errors.
 * Replace with a real Supabase client when credentials are available.
 */
export const supabase = {
  functions: {
    async invoke<T = unknown>(_name: string, _options?: { body?: unknown }): Promise<InvokeResponse<T>> {
      return {
        data: null,
        error: new Error("Supabase is not configured. Add a real client in integrations/supabase/client.ts."),
      };
    },
  },
};
