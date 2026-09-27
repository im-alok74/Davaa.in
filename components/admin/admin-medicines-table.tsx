'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Trash2, Edit2, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Medicine {
  id: number
  name: string
  generic_name: string
  manufacturer: string
  category: string
  form?: string
  strength?: string
  mrp: number
  requires_prescription: boolean
  hsn_code?: string
  mfg_date?: string
}

const PAGE_SIZE = 20

interface AdminMedicinesTableProps {
  initialMedicines: Medicine[]
  totalInitialMedicines: number
}

export function AdminMedicinesTable({ initialMedicines, totalInitialMedicines }: AdminMedicinesTableProps) {
  const router = useRouter()
  const [medicines, setMedicines] = useState<Medicine[]>(initialMedicines)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(totalInitialMedicines / PAGE_SIZE)))
  const [total, setTotal] = useState(totalInitialMedicines)
  const [isLoading, setIsLoading] = useState(false)
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null)
  const { toast } = useToast()
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const fetchMedicines = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('query', searchTerm)
      params.set('page', page.toString())
      params.set('limit', PAGE_SIZE.toString())

      const response = await fetch(`/api/admin/medicines?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setMedicines(data.medicines)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        // A delete can empty the current page (e.g. deleting the last item on the
        // last page) — step back rather than leaving "Page 3 of 2" stuck on screen.
        if (page > data.totalPages) {
          setPage(data.totalPages)
        }
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to fetch medicines',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong while fetching medicines',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Skip the redundant first fetch: the server already sent page 1 with no search term.
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true)
      return
    }
    fetchMedicines()
  }, [searchTerm, page])

  const handleSearch = () => {
    setPage(1)
    setSearchTerm(searchInput.trim())
  }

  const handleAddSuccess = (newMedicine: Medicine) => {
    fetchMedicines()
    toast({
      title: 'Success',
      description: 'Medicine added successfully'
    })
  }

  const handleEditSuccess = (updatedMedicine: Medicine) => {
    setMedicines(medicines.map(m => m.id === updatedMedicine.id ? updatedMedicine : m))
    toast({
      title: 'Success',
      description: 'Medicine updated successfully'
    })
  }

  const handleEdit = (medicine: Medicine) => {
    router.push(`/admin/medicines/form?id=${medicine.id}`)
  }

  const handleDelete = (medicine: Medicine) => {
    setMedicineToDelete(medicine)
  }

  const confirmDelete = async () => {
    if (!medicineToDelete) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin/medicines/${medicineToDelete.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (response.ok) {
        fetchMedicines()
        toast({
          title: 'Success',
          description: 'Medicine deleted successfully'
        })
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to delete medicine',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
      setMedicineToDelete(null)
    }
  }



  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>Medicines Management ({total})</CardTitle>
            <Button onClick={() => router.push('/admin/medicines/form')} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Medicine
            </Button>
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleSearch()
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search medicines..."
                className="pl-10"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSearch()
                  }
                }}
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine Name</TableHead>
                <TableHead>Generic Name</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Strength</TableHead>
                <TableHead>MRP</TableHead>
                <TableHead>Prescription</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {searchTerm ? 'No medicines found matching your search.' : 'No medicines added yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                medicines.map((medicine) => (
                  <TableRow key={medicine.id}>
                    <TableCell className="font-medium">{medicine.name}</TableCell>
                    <TableCell>{medicine.generic_name}</TableCell>
                    <TableCell>{medicine.manufacturer}</TableCell>
                    <TableCell>{medicine.category}</TableCell>
                    <TableCell>{medicine.form || 'N/A'}</TableCell>
                    <TableCell>{medicine.strength || 'N/A'}</TableCell>
                    <TableCell>₹{parseFloat(medicine.mrp.toString()).toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${medicine.requires_prescription ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {medicine.requires_prescription ? 'Yes' : 'No'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(medicine)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(medicine)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">Showing {medicines.length} of {total} medicines</p>
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

      <AlertDialog open={!!medicineToDelete} onOpenChange={() => setMedicineToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Medicine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{medicineToDelete?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
