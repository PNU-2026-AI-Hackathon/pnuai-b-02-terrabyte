import { useCallback, useState } from 'react';

export type Disclosure = {
  open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

export function useDisclosure(initialOpen = false): Disclosure {
  const [open, setOpen] = useState(initialOpen);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  return { open, show, hide, toggle };
}
