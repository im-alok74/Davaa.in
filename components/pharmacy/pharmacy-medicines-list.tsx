"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Trash2, Edit2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { medicineImageSrc } from "@/lib/images"

interface Medicine {
  id: number
  medicine_name: string
  generic_name?: string
  manufacturer?: string
  image_url?: string | null
  images?: string[]
  batch_number: string
  expiry_date: string
  stock_quantity: number
  selling_price: number
  discount_percentage: number
  mrp?: number
  last_updated?: string
}

const PAGE_SIZE = 20

export default function PharmacyMedicinesList() {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    fetchMedicines()
  }, [page])

  const fetchMedicines = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/pharmacy/inventory?page=${page}&limit=${PAGE_SIZE}`)
      const data = await response.json()

      if (response.ok) {
        setMedicines((data.inventory || []).map((item: any) => ({
          ...item,
          stock_quantity: Number(item.stock_quantity || 0),
          selling_price: Number(item.selling_price || 0),
          discount_percentage: Number(item.discount_percentage || 0),
          mrp: item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : undefined,
        })))
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 1)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch inventory",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error fetching inventory:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to remove this medicine from the storefront?")) return

    try {
      const response = await fetch(`/api/pharmacy/inventory/${id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Medicine removed from storefront successfully"
        })
        fetchMedicines()
      } else {
        const data = await response.json()
        toast({
          title: "Error",
          description: data.error || "Failed to remove medicine",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive"
      })
    }
  }

  const isExpired = (expiryDate: string) => {
    return new Date(expiryDate) < new Date()
  }

  const isExpiringSoon = (expiryDate: string) => {
    const expiryTime = new Date(expiryDate).getTime()
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime()
    return expiryTime < thirtyDaysFromNow && !isExpired(expiryDate)
  }

  if (isLoading) {
    return <div className="text-center text-muted-foreground">Loading medicines...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Medicines ({total})</CardTitle>
      </CardHeader>
      <CardContent>
        {medicines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No medicines are currently published to your store.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine Name</TableHead>
                  <TableHead>Batch No</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>EXP Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicines.map((medicine) => (
                  <TableRow key={medicine.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        {(medicine.images && medicine.images.length > 0) || medicine.image_url ? (
                          <img
                            src={medicineImageSrc(medicine.images?.[0], medicine.image_url)}
                            alt={medicine.medicine_name}
                            className="h-10 w-10 rounded-md border object-cover"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = "none"
                            }}
                          />
                        ) : null}
                        <div>
                          <div>{medicine.medicine_name}</div>
                          <div className="text-[11px] text-muted-foreground">{medicine.generic_name || medicine.manufacturer || "Published item"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{medicine.batch_number}</TableCell>
                    <TableCell>{medicine.stock_quantity}</TableCell>
                    <TableCell>₹{medicine.selling_price.toFixed(2)}</TableCell>
                    <TableCell>{medicine.discount_percentage.toFixed(0)}%</TableCell>
                    <TableCell>{new Date(medicine.expiry_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {isExpired(medicine.expiry_date) ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : isExpiringSoon(medicine.expiry_date) ? (
                        <Badge className="bg-yellow-500">Expiring Soon</Badge>
                      ) : (
                        <Badge variant="default">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/pharmacy/medicines/${medicine.id}/edit`}>
                          <Edit2 className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(medicine.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {medicines.length} of {total} medicines
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm font-medium">Page {page} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
