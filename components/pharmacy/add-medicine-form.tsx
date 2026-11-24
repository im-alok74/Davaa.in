"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus } from "lucide-react"

export default function AddMedicineForm({ onMedicineAdded }: { onMedicineAdded?: () => void }) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const [formData, setFormData] = useState({
    medicineName: "",
    genericName: "",
    manufacturer: "",
    hsnCode: "",
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    mrp: "",
    quantity: "",
    unitPrice: "",
    sellingPrice: "",
    notes: "",
    imageUrl: ""
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setImagePreview(result)
        setFormData(prev => ({
          ...prev,
          imageUrl: result
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch("/api/pharmacy/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: "Medicine added successfully"
        })
        setFormData({
          medicineName: "",
          genericName: "",
          manufacturer: "",
          hsnCode: "",
          batchNumber: "",
          mfgDate: "",
          expiryDate: "",
          mrp: "",
          quantity: "",
          unitPrice: "",
          sellingPrice: "",
          notes: "",
          imageUrl: ""
        })
        setImagePreview(null)
        setOpen(false)
        router.refresh()
        onMedicineAdded?.()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to add medicine",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error adding medicine:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Medicine
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Medicine</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Medicine Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Medicine Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Medicine Name *</Label>
                  <Input
                    name="medicineName"
                    value={formData.medicineName}
                    onChange={handleInputChange}
                    placeholder="e.g., Aspirin"
                    required
                  />
                </div>
                <div>
                  <Label>Generic Name</Label>
                  <Input
                    name="genericName"
                    value={formData.genericName}
                    onChange={handleInputChange}
                    placeholder="e.g., Acetylsalicylic acid"
                  />
                </div>
                <div>
                  <Label>Manufacturer</Label>
                  <Input
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleInputChange}
                    placeholder="e.g., Bayer"
                  />
                </div>
                <div>
                  <Label>HSN Code</Label>
                  <Input
                    name="hsnCode"
                    value={formData.hsnCode}
                    onChange={handleInputChange}
                    placeholder="Or type N/A"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Batch & Date Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Batch & Date Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Batch Number</Label>
                  <Input
                    name="batchNumber"
                    value={formData.batchNumber}
                    onChange={handleInputChange}
                    placeholder="Or type N/A"
                  />
                </div>
                <div>
                  <Label>MFG Date</Label>
                  <Input
                    name="mfgDate"
                    type="date"
                    value={formData.mfgDate}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>EXP Date *</Label>
                  <Input
                    name="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing & Quantity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pricing & Quantity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>MRP *</Label>
                  <Input
                    name="mrp"
                    type="number"
                    step="0.01"
                    value={formData.mrp}
                    onChange={handleInputChange}
                    placeholder="Maximum Retail Price"
                    required
                  />
                </div>
                <div>
                  <Label>Quantity *</Label>
                  <Input
                    name="quantity"
                    type="number"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    placeholder="Stock quantity"
                    required
                  />
                </div>
                <div>
                  <Label>Purchase Cost / Wholesale Price *</Label>
                  <Input
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={handleInputChange}
                    placeholder="Cost per unit"
                    required
                  />
                </div>
                <div>
                  <Label>Selling Price *</Label>
                  <Input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={formData.mrp || undefined}
                    value={formData.sellingPrice}
                    onChange={handleInputChange}
                    placeholder="Customer selling price"
                    required
                  />
                </div>
                {formData.quantity && formData.unitPrice && (
                  <div className="flex items-end">
                    <div>
                      <Label>Amount</Label>
                      <div className="text-2xl font-bold text-primary">
                        ₹{(parseFloat(formData.quantity) * parseFloat(formData.unitPrice)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Photo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Medicine Photo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Upload Photo</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="cursor-pointer"
                />
              </div>
              {imagePreview && (
                <div className="mt-4">
                  <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Any additional notes (optional)"
                className="w-full border rounded-md p-2 min-h-24"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Medicine"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
