import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Products</CardTitle>
        <CardDescription>This module will be available soon.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
          🚧 Under construction — data will be loaded from iDempiere REST API.
        </div>
      </CardContent>
    </Card>
  );
}
