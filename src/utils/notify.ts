import { toast } from "sonner";

export const LYRIVA_TOASTER_ID = "lyriva-notifications";

/** Keep plugin feedback on its own surface without changing Spotify notifications. */
export function notify(message: string, isError = false): void {
  try {
    const options = {
      toasterId: LYRIVA_TOASTER_ID,
      icon: null,
      richColors: false,
      duration: isError ? 5000 : 3500,
    };
    if (isError) toast.error(message, options);
    else toast(message, options);
  } catch {
    // Feedback must not interrupt the action if the host is unloading.
  }
}
