"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Field, Input } from "@/components/primitives/Field";
import { ApiError } from "@/lib/api";
import { useRegisterEnv } from "@/lib/queries";

import styles from "./RegisterEnvForm.module.css";

export function RegisterEnvForm({ onRegistered }: { onRegistered?: (id: string) => void }) {
  const [path, setPath] = useState("");
  const register = useRegisterEnv();
  const error =
    register.error instanceof ApiError ? String(register.error.detail) : register.error?.message;

  const submit = async () => {
    const env = await register.mutateAsync(path.trim());
    setPath("");
    onRegistered?.(env.id);
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (path.trim()) void submit();
      }}
    >
      <Field
        label="Tasks file"
        htmlFor="env-path"
        hint="Absolute path to a HUD tasks file (.py). It is loaded in a subprocess and described, nothing runs yet."
        error={error}
      >
        <div className={styles.row}>
          <Input
            id="env-path"
            placeholder="/home/you/project/tasks.py"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="primary"
            icon={<FolderPlus size={14} />}
            loading={register.isPending}
            disabled={!path.trim()}
          >
            Register
          </Button>
        </div>
      </Field>
    </form>
  );
}
