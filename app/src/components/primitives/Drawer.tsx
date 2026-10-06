"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

import { DUR, EASE } from "@theme/motion";

import styles from "./Drawer.module.css";

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

/* A right-hand panel that slides in over the page. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 440,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.base }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className={`surface ${styles.panel}`}
                style={{ width }}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ duration: DUR.base, ease: EASE.out }}
              >
                <header className={styles.header}>
                  <div>
                    <Dialog.Title className={styles.title}>{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className={styles.description}>
                        {description}
                      </Dialog.Description>
                    ) : (
                      <Dialog.Description className="visually-hidden">{title}</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close className={styles.close} aria-label="Close">
                    <X size={16} />
                  </Dialog.Close>
                </header>
                <div className={styles.body}>{children}</div>
                {footer && <footer className={styles.footer}>{footer}</footer>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
