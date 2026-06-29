"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

// Item editável de taxonomia (área/tag): nome + ✎ renomear (inline) + deletar (com confirmação).
// Unifica edição e deleção num só componente porque (feedback do dono):
//  1) ao ENTRAR em edição, o botão de deletar SOME (mata o "X do lado do outro");
//  2) o cancelar (✕) tem cor de destaque suave (destructive/70), parecido com o confirmar (✓);
//  3) deletar abre um AlertDialog de confirmação → ao confirmar, o item vira SKELETON até sumir de fato
//     (a revalidação remove a linha; o componente fica em skeleton durante o intervalo).
// As MESMAS server actions de renomear/deletar são passadas por prop (lógica intacta).
export function EditableTaxItem({
  renameAction,
  deleteAction,
  idName,
  idValue,
  value,
  layout = "inline",
  deleteVariant = "x",
  confirmTitle,
  confirmDescription,
  inputTestid,
  renameTestid,
  deleteTestid,
  badge,
}: {
  renameAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  idName: string;
  idValue: string;
  value: string;
  layout?: "inline" | "spread"; // inline = chip (tag); spread = linha com deletar à direita (área)
  deleteVariant?: "x" | "trash";
  confirmTitle: string;
  confirmDescription: string;
  inputTestid?: string;
  renameTestid?: string;
  deleteTestid?: string;
  badge?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return <Skeleton className="my-0.5 h-4 w-20" data-testid="tax-deletando" />;
  }

  if (editing) {
    return (
      <form action={renameAction} className="flex items-center gap-1">
        <input type="hidden" name={idName} value={idValue} />
        <Input name="name" defaultValue={value} autoFocus className="h-8 w-36" data-testid={inputTestid} />
        <button
          type="submit"
          aria-label="Confirmar"
          className="shrink-0 text-success transition-opacity hover:opacity-80"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancelar"
          className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </form>
    );
  }

  const DeleteIcon = deleteVariant === "trash" ? Trash2 : X;
  const deleteButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          data-testid={deleteTestid}
          aria-label={`Deletar ${value}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
        >
          <DeleteIcon className={deleteVariant === "trash" ? "size-4" : "size-3.5"} />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <form action={deleteAction} onSubmit={() => setDeleting(true)}>
            <input type="hidden" name={idName} value={idValue} />
            <AlertDialogAction
              type="submit"
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const nameWithEdit = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Renomear ${value}`}
        data-testid={renameTestid}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      {badge}
    </span>
  );

  if (layout === "spread") {
    return (
      <div className="flex w-full items-center justify-between gap-2">
        {nameWithEdit}
        {deleteButton}
      </div>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {nameWithEdit}
      {deleteButton}
    </span>
  );
}
