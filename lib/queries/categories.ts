import { createClient } from "@/lib/supabase/server";

export interface CategoryItem {
  id: string;
  name: string;
  productCount: number;
}

// Categories for the signed-in organisation, with how many products reference
// each one. The count matters because FR-3.7 forbids deleting a category while
// products still point at it - the screen can say so before the attempt rather
// than after it fails.
export async function listCategories(): Promise<CategoryItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, products ( id )")
    .order("name", { ascending: true });

  if (error) {
    console.error("[queries.listCategories]", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    productCount: row.products?.length ?? 0,
  }));
}
