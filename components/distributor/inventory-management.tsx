"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Trash2, Edit2, Plus, Loader2, Pencil, ChevronLeft, ChevronRight } from "lucide-react"

interface InventoryItem {
  id: number
  medicine_id: number
  name: string
  generic_name: string
  manufacturer: string
  batch_number: string
  mfg_date: string
  expiry_date: string
  mrp: number | string
  quantity: number | string
  // Stored as `unit_price` in DB, but semantically this is the distributor wholesale price.
  unit_price: number | string
  amount: number | string
  hsn_code: string
  notes: string
  form: string
  strength: string
  reserved_quantity?: number
  images?: string[]
  image_url?: string
}

// These are enforced by the database CHECK constraint on medicines.form
const ALLOWED_FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "cream",
  "drops",
  "inhaler",
  "other",
] as const

export function AddMedicineForm() {
  const [loading, setLoading] = useState(true)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [formOptions, setFormOptions] = useState<string[]>([...ALLOWED_FORMS])
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [isNewMedicine, setIsNewMedicine] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [searchingCatalog, setSearchingCatalog] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedCatalogMedicine, setSelectedCatalogMedicine] = useState<any | null>(null)
  const [formData, setFormData] = useState({
    medicineId: "",
    name: "",
    genericName: "",
    manufacturer: "",
    category: "",
    form: "",
    strength: "",
    packSize: "",
    imageUrl: "",
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    mrp: "",
    quantity: "",
    wholesalePrice: "",
    hsnCode: "",
    notes: "",
  })
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const { toast } = useToast()

  const uploadImageFile = async (file: File) => {
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/medicines/upload-image", {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) {
        toast({
          title: "Upload failed",
          description: data.error || "Failed to upload image",
          variant: "destructive",
        })
        return
      }
      setFormData((prev) => ({ ...prev, imageUrl: prev.imageUrl || data.url }))
      setImageUrls((prev) => [...prev, data.url])
      toast({ title: "Uploaded", description: "Image uploaded successfully" })
    } catch (e) {
      toast({
        title: "Upload failed",
        description: "Something went wrong while uploading",
        variant: "destructive",
      })
    } finally {
      setUploadingImage(false)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const catRes = await fetch("/api/medicines/categories")

        if (catRes.ok) {
          const catData = await catRes.json()
          setCategoryOptions(catData.categories || [])
        }

      } catch (error) {
        console.error("Error fetching categories:", error)
        toast({
          title: "Error",
          description: "Failed to load categories",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (isNewMedicine) {
      return
    }

    const q = searchText.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }

    let cancelled = false
    const t = setTimeout(async () => {
      setSearchingCatalog(true)
      try {
        const params = new URLSearchParams({ q, limit: "20" })
        const res = await fetch(`/api/distributor/medicines/search?${params}`)
        const data = await res.json()
        if (!cancelled) {
          setSearchResults(data.medicines || [])
        }
      } catch (error) {
        if (!cancelled) {
          setSearchResults([])
        }
      } finally {
        if (!cancelled) {
          setSearchingCatalog(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [searchText, isNewMedicine])

  const handleSelectCatalogMedicine = (medicine: any) => {
    setSelectedCatalogMedicine(medicine)
    setSearchText(`${medicine.name}${medicine.strength ? ` - ${medicine.strength}` : ""}`)
    setSearchResults([])
    setFormData((prev) => ({
      ...prev,
      medicineId: String(medicine.id),
      mrp: medicine.mrp ? String(medicine.mrp) : prev.mrp,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    if (!isNewMedicine && !formData.medicineId) {
      toast({
        title: "Select medicine",
        description: "Please select a medicine from the list or switch to adding a new one.",
        variant: "destructive",
      })
      setSubmitting(false)
      return
    }

    if (isNewMedicine && !formData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a medicine name.",
        variant: "destructive",
      })
      setSubmitting(false)
      return
    }

    try {
      const rawForm = formData.form.trim().toLowerCase()
      const normalizedForm = ALLOWED_FORMS.includes(rawForm as (typeof ALLOWED_FORMS)[number])
        ? rawForm
        : "other"

      const response = await fetch("/api/distributor/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isNewMedicine,
          medicineId: formData.medicineId ? parseInt(formData.medicineId) : null,
          imageUrls,
          newMedicine: isNewMedicine
            ? {
                name: formData.name.trim(),
                generic_name: formData.genericName.trim() || null,
                manufacturer: formData.manufacturer.trim() || null,
                category: formData.category.trim() || null,
                form: normalizedForm,
                strength: formData.strength.trim() || null,
                pack_size: formData.packSize.trim() || null,
                mrp: parseFloat(formData.mrp),
                image_url: formData.imageUrl.trim() || null,
                requires_prescription: false,
              }
            : null,
          batchNumber: formData.batchNumber,
          mfgDate: formData.mfgDate || null,
          expiryDate: formData.expiryDate,
          mrp: parseFloat(formData.mrp),
          quantity: parseInt(formData.quantity),
          wholesalePrice: parseFloat(formData.wholesalePrice),
          hsnCode: formData.hsnCode,
          notes: formData.notes,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        console.error("Add medicine error:", data)
        toast({
          title: "Error",
          description: data.error || "Failed to add medicine",
          variant: "destructive",
        })
        return
      }

      const data = await response.json()
      console.log("Medicine added successfully:", data)

      toast({
        title: "Success",
        description: data.message || "Medicine added to inventory",
      })

      // Reset form
      setFormData({
        medicineId: "",
        name: "",
        genericName: "",
        manufacturer: "",
        category: "",
        form: "",
        strength: "",
        packSize: "",
        imageUrl: "",
        batchNumber: "",
        mfgDate: "",
        expiryDate: "",
        mrp: "",
        quantity: "",
        wholesalePrice: "",
        hsnCode: "",
        notes: "",
      })
      setImageUrls([])
      setSearchText("")
      setSearchResults([])
      setSelectedCatalogMedicine(null)

    } catch (error) {
      console.error("Error:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-6 mb-8">
      <h2 className="text-lg font-semibold mb-6">Add Medicine to Inventory</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {isNewMedicine
              ? "Create a new medicine in the catalog and add its stock."
              : "Select an existing medicine from the catalog and add stock."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsNewMedicine((v) => !v)}
          >
            {isNewMedicine ? "Use existing medicine" : "Add new medicine"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isNewMedicine ? (
            <div className="md:col-span-2">
              <Label htmlFor="medicineSearch">Search Medicine *</Label>
              {loading ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  Loading catalog...
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    id="medicineSearch"
                    value={searchText}
                    onChange={(e) => {
                      setSearchText(e.target.value)
                      setSelectedCatalogMedicine(null)
                      setFormData((prev) => ({ ...prev, medicineId: "" }))
                    }}
                    placeholder="Type medicine name, generic name, or manufacturer"
                    required
                  />

                  {searchingCatalog && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  )}

                  {!searchingCatalog && searchResults.length > 0 && !selectedCatalogMedicine && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-background">
                      {searchResults.map((medicine) => (
                        <button
                          key={medicine.id}
                          type="button"
                          onClick={() => handleSelectCatalogMedicine(medicine)}
                          className="w-full border-b border-border px-3 py-2 text-left hover:bg-muted/50 last:border-b-0"
                        >
                          <div className="font-medium text-sm">{medicine.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {medicine.generic_name || "-"}
                            {medicine.strength ? ` | ${medicine.strength}` : ""}
                            {medicine.form ? ` | ${medicine.form}` : ""}
                            {medicine.in_inventory ? " | Already in inventory" : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCatalogMedicine && (
                    <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                      Selected: {selectedCatalogMedicine.name}
                      {selectedCatalogMedicine.strength ? ` (${selectedCatalogMedicine.strength})` : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="name">Medicine Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="genericName">Generic Name</Label>
                <Input
                  id="genericName"
                  value={formData.genericName}
                  onChange={(e) =>
                    setFormData({ ...formData, genericName: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) =>
                    setFormData({ ...formData, manufacturer: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                >
                  <option value="">Select or type category</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <Input
                  id="categoryCustom"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="mt-2"
                  placeholder="Or type a new category (e.g., Antibiotic)"
                />
              </div>
              <div>
                <Label htmlFor="form">Form</Label>
                <select
                  id="form"
                  value={formData.form}
                  onChange={(e) =>
                    setFormData({ ...formData, form: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                >
                  <option value="">Select or type form</option>
                  {formOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <Input
                  id="formCustom"
                  value={formData.form}
                  onChange={(e) =>
                    setFormData({ ...formData, form: e.target.value })
                  }
                  className="mt-2"
                  placeholder="Or type a new form (e.g., tablet, syrup)"
                />
              </div>
              <div>
                <Label htmlFor="strength">Strength</Label>
                <Input
                  id="strength"
                  value={formData.strength}
                  onChange={(e) =>
                    setFormData({ ...formData, strength: e.target.value })
                  }
                  className="mt-1"
                  placeholder="e.g., 500mg"
                />
              </div>
              <div>
                <Label htmlFor="packSize">Pack Size</Label>
                <Input
                  id="packSize"
                  value={formData.packSize}
                  onChange={(e) =>
                    setFormData({ ...formData, packSize: e.target.value })
                  }
                  className="mt-1"
                  placeholder="e.g., strip of 10"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="imageUrl">Medicine Photo (Image URL)</Label>
                <Input
                  id="imageUrl"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="mt-1"
                  placeholder="https://..."
                />
                <div className="mt-3 flex items-center gap-3">
                  <Input
                    id="imageInput"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadImageFile(file)
                    }}
                    disabled={uploadingImage}
                  />
                  <Button type="button" variant="outline" size="sm" disabled>
                    {uploadingImage ? "Uploading..." : "Upload"}
                  </Button>
                </div>
                {imageUrls.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Added Images ({imageUrls.length})</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const input = document.getElementById("imageInput") as HTMLInputElement
                          input?.click()
                        }}
                        disabled={uploadingImage}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add More Images
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {imageUrls.map((url) => (
                        <div key={url} className="relative">
                          <img
                            src={url}
                            alt="Preview"
                            className="h-16 w-16 rounded-md border object-cover"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = "none"
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setImageUrls((prev) => prev.filter((u) => u !== url))
                            }}
                            className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div>
            <Label htmlFor="batchNumber">Batch Number</Label>
            <Input
              id="batchNumber"
              value={formData.batchNumber}
              onChange={(e) =>
                setFormData({ ...formData, batchNumber: e.target.value })
              }
              placeholder="e.g., B12345"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="mfgDate">Mfg. Date</Label>
            <Input
              id="mfgDate"
              type="date"
              value={formData.mfgDate}
              onChange={(e) =>
                setFormData({ ...formData, mfgDate: e.target.value })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="expiryDate">Expiry Date *</Label>
            <Input
              id="expiryDate"
              type="date"
              value={formData.expiryDate}
              onChange={(e) =>
                setFormData({ ...formData, expiryDate: e.target.value })
              }
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="mrp">MRP (₹) *</Label>
            <Input
              id="mrp"
              type="number"
              step="0.01"
              value={formData.mrp}
              onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
              placeholder="0.00"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value })
              }
              placeholder="0"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="wholesalePrice">Wholesale Price (₹) *</Label>
            <Input
              id="wholesalePrice"
              type="number"
              step="0.01"
              value={formData.wholesalePrice}
              onChange={(e) =>
                setFormData({ ...formData, wholesalePrice: e.target.value })
              }
              placeholder="0.00"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="hsnCode">HSN Code</Label>
            <Input
              id="hsnCode"
              value={formData.hsnCode}
              onChange={(e) =>
                setFormData({ ...formData, hsnCode: e.target.value })
              }
              placeholder="e.g., 3004"
              className="mt-1"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Additional notes"
              className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
              rows={3}
            />
          </div>
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Add to Inventory
            </>
          )}
        </Button>
      </form>
    </Card>
  )
}

const PAGE_SIZE = 20

export function InventoryTable() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    fetchInventory()
  }, [refreshTrigger, page])

  const fetchInventory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/distributor/inventory?page=${page}&limit=${PAGE_SIZE}`)
      if (!response.ok) {
        throw new Error("Failed to fetch inventory")
      }
      const data = await response.json()
      console.log("Inventory fetched:", data)
      const normalized = (data.inventory || []).map((it: any) => ({
        ...it,
        mrp: Number(it.mrp || 0),
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        amount: Number(it.amount || 0),
        reserved_quantity: it.reserved_quantity !== undefined ? Number(it.reserved_quantity || 0) : undefined,
      }))
      setInventory(normalized)
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
    } catch (error) {
      console.error("Error fetching inventory:", error)
      toast({
        title: "Error",
        description: "Failed to load inventory",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to remove this medicine?")) return

    setDeleting(id)
    try {
      const response = await fetch(`/api/distributor/inventory/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        console.error("Delete error:", data)
        toast({
          title: "Error",
          description: data.error || "Failed to delete",
          variant: "destructive",
        })
        return
      }

      const data = await response.json()
      console.log("Medicine deleted:", data)

      toast({ title: "Success", description: data.message })
      fetchInventory()
    } catch (error) {
      console.error("Delete error:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setDeleting(null)
    }
  }

  const isExpiringSoon = (expiryDate: string) => {
    const now = new Date()
    const expiry = new Date(expiryDate)
    const daysUntilExpiry = Math.ceil(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0
  }

  const isExpired = (expiryDate: string) => {
    return new Date(expiryDate) < new Date()
  }

  if (loading) {
    return <div className="text-center py-8">Loading inventory...</div>
  }

  if (inventory.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No medicines in inventory yet</p>
      </Card>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Medicine Name</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>MRP</TableHead>
            <TableHead>Wholesale Price</TableHead>
            <TableHead>Total Amount</TableHead>
            <TableHead>Expiry Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inventory.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
                  {item.images?.[0] || item.image_url ? (
                    <img
                      src={item.images?.[0] || item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none"
                      }}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No image</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.strength} - {item.form}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-sm">{item.batch_number || "-"}</TableCell>
              <TableCell className="font-medium">{Number(item.quantity)}</TableCell>
              <TableCell className="text-sm">₹{Number(item.mrp || 0).toFixed(2)}</TableCell>
              <TableCell className="text-sm">₹{Number(item.unit_price).toFixed(2)}</TableCell>
              <TableCell className="font-medium">
                ₹{Number(item.amount || (Number(item.quantity) * Number(item.unit_price))).toFixed(2)}
              </TableCell>
              <TableCell className="text-sm">
                {new Date(item.expiry_date).toLocaleDateString("en-IN")}
              </TableCell>
              <TableCell>
                {isExpired(item.expiry_date) ? (
                  <Badge variant="destructive" className="text-xs">
                    Expired
                  </Badge>
                ) : isExpiringSoon(item.expiry_date) ? (
                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                    Expiring Soon
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                    Active
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/distributor/inventory/${item.id}/edit`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-primary hover:bg-primary/10"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    className="p-1 text-destructive hover:bg-destructive/10 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-muted-foreground">
            Showing {inventory.length} of {total} items
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
    </div>
  )
}
