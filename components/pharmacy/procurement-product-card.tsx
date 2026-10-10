import { AlertCircle, Loader2, ShoppingCart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface ProcurementCardItem {
  id: number
  name: string
  generic_name: string
  manufacturer: string
  strength: string
  form: string
    pack_size?: string
  distributor_name: string
  batch_number: string
  expiry_date: string
  mrp: number | string
  unit_price: number | string
  available_quantity: number | string
  stock_status: "in_stock" | "out_of_stock"
  images?: string[]
  image_url?: string
}

interface Props {
  item: ProcurementCardItem
  requesting: boolean
  onAdd: () => void
  onRequest: () => void
}

export function ProcurementProductCard({ item, requesting, onAdd, onRequest }: Props) {
  const isOutOfStock = item.stock_status === "out_of_stock"
  const available = Number(item.available_quantity)
  const mrp = Number(item.mrp || 0)
  const price = Number(item.unit_price || 0)
  const imageSrc = item.images?.[0] || item.image_url
  const subtitle = [item.strength, item.form].filter(Boolean).join(" · ")

  return (
    <article className="surface surface-hover group relative flex h-full flex-col overflow-hidden">
      <div className="relative h-40 overflow-hidden bg-muted/50">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={item.name}
            className="h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {isOutOfStock && (
          <Badge variant="destructive" className="absolute left-2 top-2 text-xs">
            Out of Stock
          </Badge>
        )}
      </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3"> 
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground">
          {item.name}
        </h3>
        {item.generic_name ? (
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {item.generic_name}
          </p>
        ) : null}
        {subtitle ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        {item.manufacturer ? (
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {item.manufacturer}
          </p>
        ) : null}
                {item.pack_size ? (
          <p className="line-clamp-1 text-sm text-muted-foreground">Pack: {item.pack_size}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Distributor: <span className="font-medium text-foreground">{item.distributor_name}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Batch: {item.batch_number || "-"} · Exp:{" "}
          {new Date(item.expiry_date).toLocaleDateString("en-IN")}
        </p>

        <div className="mt-auto pt-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold">₹{price.toFixed(2)}</span>
            {mrp > price ? (
              <span className="text-sm text-muted-foreground line-through">₹{mrp.toFixed(2)}</span>
            ) : null}
          </div>
          <Badge variant={available > 0 ? "outline" : "secondary"} className="mt-1">
            {available > 0 ? `${available} available` : "Unavailable"}
          </Badge>
        </div>
      </div>

      <div className="border-t border-border p-3 pt-2.5">
        {isOutOfStock ? (
          <Button size="sm" variant="outline" className="w-full" onClick={onRequest} disabled={requesting}>
            {requesting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <AlertCircle className="mr-1 h-4 w-4" />
            )}
            Request
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onAdd} disabled={available <= 0}>
            <ShoppingCart className="mr-1 h-4 w-4" />
            Add
          </Button>
        )}
      </div>
    </article>
  )
}