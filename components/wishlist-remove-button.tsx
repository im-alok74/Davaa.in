"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export function WishlistRemoveButton({ medicineId, name }: { medicineId: number; name: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch("/api/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicineId }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      toast({ title: "Could not remove item", description: "Please try again.", variant: "destructive" })
      setBusy(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={busy} aria-label={`Remove ${name} from saved medicines`}>
      <Trash2 className="mr-1 h-4 w-4" />
      Remove
    </Button>
  )
}
