import { toast } from 'sonner';

export const showErrorToast = (message: string) => {
  toast.error(message);
};

export const showSuccessToast = (message: string) => {
  toast.success(message);
};

export const showLoadingToast = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (id: string | number) => {
  toast.dismiss(id);
};