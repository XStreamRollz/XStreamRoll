import { render } from "@testing-library/react"
import * as React from "react"
// ---------------------------------------------------------------------------
// Form Components (require react-hook-form context)
// ---------------------------------------------------------------------------

import { useForm } from "react-hook-form"
// ---------------------------------------------------------------------------
// Chart Component (requires recharts)
// ---------------------------------------------------------------------------

import * as RechartsPrimitive from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import { buildThemeTest } from "@/lib/test-utils"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion"
import { Alert, AlertDescription, AlertTitle } from "./alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog"
import { AspectRatio } from "./aspect-ratio"
import { Avatar, AvatarFallback } from "./avatar"
// ChartTooltipContent and ChartLegendContent are internal components that
// must be used within a ChartContainer + recharts chart context.
// They are implicitly tested by the main Chart test above.

// ---------------------------------------------------------------------------
// Imports (kept at bottom to avoid hoisting issues)
// ---------------------------------------------------------------------------

import { Badge } from "./badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb"
import { Button } from "./button"
import { ButtonGroup } from "./button-group"
import { Calendar } from "./calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"
import { Carousel, CarouselContent, CarouselItem } from "./carousel"
import { ChartContainer } from "./chart"
import { Checkbox } from "./checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import { ConfirmDialog } from "./confirm-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty"
import { Field, FieldContent, FieldDescription, FieldLabel } from "./field"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form"
import { HoverCard, HoverCardContent } from "./hover-card"
import { Input } from "./input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "./input-group"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "./input-otp"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "./item"
import { Kbd, KbdGroup } from "./kbd"
import { Label } from "./label"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "./menubar"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./navigation-menu"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination"
import { Popover, PopoverContent } from "./popover"
import { Progress } from "./progress"
import { RadioGroup, RadioGroupItem } from "./radio-group"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./resizable"
import { ScrollArea } from "./scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "./select"
import { Separator } from "./separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./sidebar"
import { Skeleton } from "./skeleton"
import { Slider } from "./slider"
import { Toaster } from "./sonner"
import { Spinner } from "./spinner"
import { Switch } from "./switch"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"
import { Textarea } from "./textarea"
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast"
import { Toggle } from "./toggle"
import { ToggleGroup, ToggleGroupItem } from "./toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTheme = { current: "light" as string }

jest.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useTheme: () => ({ theme: mockTheme.current, setTheme: jest.fn() }),
}))

const mockEmblaApi = {
  scrollPrev: jest.fn(),
  scrollNext: jest.fn(),
  canScrollPrev: jest.fn(() => false),
  canScrollNext: jest.fn(() => false),
  on: jest.fn(),
  off: jest.fn(),
}

jest.mock("embla-carousel-react", () => ({
  __esModule: true,
  default: () => [jest.fn(), mockEmblaApi],
}))

beforeEach(() => {
  mockTheme.current = "light"
  ;(useIsMobile as jest.Mock).mockReturnValue(false)
})

// ---------------------------------------------------------------------------
// Simple / Atomic Components
// ---------------------------------------------------------------------------

buildThemeTest("Badge", () => <Badge>Default</Badge>)
buildThemeTest("Badge (secondary)", () => (
  <Badge variant="secondary">Secondary</Badge>
))
buildThemeTest("Badge (destructive)", () => (
  <Badge variant="destructive">Destructive</Badge>
))
buildThemeTest("Badge (outline)", () => (
  <Badge variant="outline">Outline</Badge>
))
buildThemeTest("Button", () => <Button>Click</Button>)
buildThemeTest("Button (destructive)", () => (
  <Button variant="destructive">Delete</Button>
))
buildThemeTest("Button (outline)", () => (
  <Button variant="outline">Outline</Button>
))
buildThemeTest("Button (secondary)", () => (
  <Button variant="secondary">Secondary</Button>
))
buildThemeTest("Button (ghost)", () => <Button variant="ghost">Ghost</Button>)
buildThemeTest("Button (link)", () => <Button variant="link">Link</Button>)
buildThemeTest("Input", () => <Input placeholder="Enter text" />)
buildThemeTest("Textarea", () => <Textarea placeholder="Enter text" />)
buildThemeTest("Label", () => <Label>Field Label</Label>)
buildThemeTest("Kbd", () => <Kbd>Ctrl+K</Kbd>)
buildThemeTest("KbdGroup", () => (
  <KbdGroup>
    <Kbd>⌘</Kbd>
    <Kbd>K</Kbd>
  </KbdGroup>
))
buildThemeTest("Skeleton", () => <Skeleton className="h-4 w-12" />)
buildThemeTest("Spinner", () => <Spinner />)
buildThemeTest("Separator", () => <Separator />)
buildThemeTest("Toggle", () => <Toggle>Toggle</Toggle>)
buildThemeTest("Checkbox", () => <Checkbox />)
buildThemeTest("Switch", () => <Switch />)
buildThemeTest("Slider", () => <Slider defaultValue={[50]} />)
buildThemeTest("Progress", () => <Progress value={60} />)
buildThemeTest("Calendar", () => <Calendar mode="single" />)
buildThemeTest("AspectRatio", () => (
  <AspectRatio ratio={16 / 9}>
    <div className="flex h-full items-center justify-center bg-muted">16:9</div>
  </AspectRatio>
))
buildThemeTest("ScrollArea", () => (
  <ScrollArea className="h-20 w-40">
    <div className="p-2">Scroll content</div>
  </ScrollArea>
))

// ---------------------------------------------------------------------------
// Layout Components
// ---------------------------------------------------------------------------

buildThemeTest("Card", () => (
  <Card>
    <CardHeader>
      <CardTitle>Card Title</CardTitle>
      <CardDescription>Card description text</CardDescription>
    </CardHeader>
    <CardContent>Main content</CardContent>
    <CardFooter>Footer</CardFooter>
  </Card>
))

buildThemeTest("Table", () => (
  <Table>
    <TableCaption>List of items</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Value</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Alpha</TableCell>
        <TableCell>100</TableCell>
      </TableRow>
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell>Total</TableCell>
        <TableCell>100</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
))

buildThemeTest("Item", () => (
  <ItemGroup>
    <Item>
      <ItemContent>
        <ItemTitle>Item Title</ItemTitle>
        <ItemDescription>Description goes here</ItemDescription>
      </ItemContent>
    </Item>
  </ItemGroup>
))

buildThemeTest("Empty", () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon" />
      <EmptyTitle>No data found</EmptyTitle>
      <EmptyDescription>Try adjusting your filters</EmptyDescription>
    </EmptyHeader>
    <EmptyContent />
  </Empty>
))

buildThemeTest("Field", () => (
  <Field orientation="vertical">
    <FieldLabel>Username</FieldLabel>
    <FieldContent>
      <Input placeholder="Enter username" />
    </FieldContent>
    <FieldDescription>Your unique display name</FieldDescription>
  </Field>
))

// ---------------------------------------------------------------------------
// Interactive / Compound Components
// ---------------------------------------------------------------------------

buildThemeTest("Accordion", () => (
  <Accordion type="single" collapsible>
    <AccordionItem value="item-1">
      <AccordionTrigger>Section One</AccordionTrigger>
      <AccordionContent>Content for section one.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="item-2">
      <AccordionTrigger>Section Two</AccordionTrigger>
      <AccordionContent>Content for section two.</AccordionContent>
    </AccordionItem>
  </Accordion>
))

buildThemeTest("Alert", () => (
  <Alert>
    <AlertTitle>Attention</AlertTitle>
    <AlertDescription>This is an alert message.</AlertDescription>
  </Alert>
))

buildThemeTest("Alert (destructive)", () => (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>Something went wrong.</AlertDescription>
  </Alert>
))

buildThemeTest("AlertDialog", () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm</AlertDialogTitle>
        <AlertDialogDescription>Are you sure?</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Continue</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
))

buildThemeTest("Avatar", () => (
  <Avatar>
    <AvatarFallback>JD</AvatarFallback>
  </Avatar>
))

buildThemeTest("Breadcrumb", () => (
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem>
        <BreadcrumbLink href="/">Home</BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbLink href="/section">Section</BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbPage>Current</BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
))

buildThemeTest("ButtonGroup", () => (
  <ButtonGroup>
    <Button>Left</Button>
    <Button>Center</Button>
    <Button>Right</Button>
  </ButtonGroup>
))

buildThemeTest("Collapsible", () => (
  <Collapsible>
    <CollapsibleTrigger>Toggle</CollapsibleTrigger>
    <CollapsibleContent>Collapsible content</CollapsibleContent>
  </Collapsible>
))

buildThemeTest("ConfirmDialog", () => (
  <ConfirmDialog
    title="Delete item"
    description="This action cannot be undone."
    onConfirm={() => {}}
    open={false}
  />
))

buildThemeTest("Dialog", () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Dialog Title</DialogTitle>
        <DialogDescription>Dialog description text.</DialogDescription>
      </DialogHeader>
      <DialogFooter />
    </DialogContent>
  </Dialog>
))

buildThemeTest("Drawer", () => (
  <Drawer open>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Drawer Title</DrawerTitle>
        <DrawerDescription>Drawer description.</DrawerDescription>
      </DrawerHeader>
      <DrawerFooter />
    </DrawerContent>
  </Drawer>
))

buildThemeTest("DropdownMenu", () => (
  <DropdownMenu open>
    <DropdownMenuContent>
      <DropdownMenuItem>Profile</DropdownMenuItem>
      <DropdownMenuItem>Settings</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive">Logout</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
))

buildThemeTest("HoverCard", () => (
  <HoverCard open>
    <HoverCardContent>Hover card content</HoverCardContent>
  </HoverCard>
))

buildThemeTest("Menubar", () => (
  <Menubar>
    <MenubarMenu>
      <MenubarTrigger>File</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>New</MenubarItem>
        <MenubarItem>Open</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Exit</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
))

buildThemeTest("NavigationMenu", () => (
  <NavigationMenu>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuTrigger>Item One</NavigationMenuTrigger>
        <NavigationMenuContent>
          <NavigationMenuLink href="/one">Link One</NavigationMenuLink>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
))

buildThemeTest("Pagination", () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          2
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" />
      </PaginationItem>
    </PaginationContent>
  </Pagination>
))

buildThemeTest("Popover", () => (
  <Popover open>
    <PopoverContent>Popover content</PopoverContent>
  </Popover>
))

buildThemeTest("RadioGroup", () => (
  <RadioGroup defaultValue="option-1">
    <RadioGroupItem value="option-1" />
    <RadioGroupItem value="option-2" />
  </RadioGroup>
))

buildThemeTest("Select", () => (
  <Select open>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Fruits</SelectLabel>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
      </SelectGroup>
      <SelectSeparator />
    </SelectContent>
  </Select>
))

buildThemeTest("Sheet", () => (
  <Sheet open>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Sheet Title</SheetTitle>
        <SheetDescription>Sheet description.</SheetDescription>
      </SheetHeader>
      <SheetFooter />
    </SheetContent>
  </Sheet>
))

buildThemeTest("Tabs", () => (
  <Tabs defaultValue="tab-1">
    <TabsList>
      <TabsTrigger value="tab-1">Tab One</TabsTrigger>
      <TabsTrigger value="tab-2">Tab Two</TabsTrigger>
    </TabsList>
    <TabsContent value="tab-1">Content one</TabsContent>
    <TabsContent value="tab-2">Content two</TabsContent>
  </Tabs>
))

buildThemeTest("ToggleGroup", () => (
  <ToggleGroup type="single" defaultValue="a">
    <ToggleGroupItem value="a">A</ToggleGroupItem>
    <ToggleGroupItem value="b">B</ToggleGroupItem>
  </ToggleGroup>
))

buildThemeTest("Tooltip", () => (
  <Tooltip open>
    <TooltipTrigger>Hover me</TooltipTrigger>
    <TooltipContent>Tooltip text</TooltipContent>
  </Tooltip>
))

buildThemeTest("Resizable", () => (
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel defaultSize={50}>Left panel</ResizablePanel>
    <ResizableHandle />
    <ResizablePanel defaultSize={50}>Right panel</ResizablePanel>
  </ResizablePanelGroup>
))

buildThemeTest("InputOTP", () => (
  <InputOTP maxLength={6}>
    <InputOTPGroup>
      <InputOTPSlot index={0} />
      <InputOTPSlot index={1} />
      <InputOTPSlot index={2} />
    </InputOTPGroup>
    <InputOTPSeparator />
    <InputOTPGroup>
      <InputOTPSlot index={3} />
      <InputOTPSlot index={4} />
      <InputOTPSlot index={5} />
    </InputOTPGroup>
  </InputOTP>
))

buildThemeTest("InputGroup", () => (
  <InputGroup>
    <InputGroupAddon align="inline-start">
      <InputGroupText>$</InputGroupText>
    </InputGroupAddon>
    <InputGroupInput placeholder="Amount" />
    <InputGroupAddon align="inline-end">
      <InputGroupButton>.00</InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
))

buildThemeTest("ContextMenu", () => (
  <ContextMenu>
    <ContextMenuTrigger>
      <div className="border p-8">Right-click area</div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem>Action</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
))

buildThemeTest("Carousel", () => (
  <Carousel>
    <CarouselContent>
      <CarouselItem>Slide 1</CarouselItem>
      <CarouselItem>Slide 2</CarouselItem>
      <CarouselItem>Slide 3</CarouselItem>
    </CarouselContent>
  </Carousel>
))

// ---------------------------------------------------------------------------
// Complex Custom Components
// ---------------------------------------------------------------------------

buildThemeTest("Command (with Dialog)", () => (
  <CommandDialog open>
    <CommandInput placeholder="Search..." />
    <CommandList>
      <CommandEmpty>No results.</CommandEmpty>
      <CommandGroup heading="Suggestions">
        <CommandItem>Item A</CommandItem>
        <CommandItem>Item B</CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
))

buildThemeTest("Sidebar", () => (
  <SidebarProvider defaultOpen>
    <Sidebar collapsible="none">
      <SidebarHeader>
        <SidebarInput placeholder="Search..." />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Home</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>Settings</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
    <SidebarInset>
      <SidebarTrigger />
      <main>Page content</main>
    </SidebarInset>
  </SidebarProvider>
))

buildThemeTest("Sidebar (collapsible icon)", () => (
  <SidebarProvider defaultOpen>
    <Sidebar collapsible="icon">
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Home">Home</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  </SidebarProvider>
))

buildThemeTest("Toaster (sonner)", () => <Toaster />)

buildThemeTest("ToastProvider", () => (
  <ToastProvider>
    <ToastViewport />
    <Toast>
      <ToastTitle>Notification</ToastTitle>
      <ToastDescription>You have a new message.</ToastDescription>
      <ToastClose />
      <ToastAction altText="view">View</ToastAction>
    </Toast>
  </ToastProvider>
))

buildThemeTest("Toaster (custom)", () => <Toaster />)

function FormTestWrapper() {
  const form = useForm()
  return (
    <Form {...form}>
      <FormField
        name="test"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Test Field</FormLabel>
            <FormControl>
              <input {...field} placeholder="Enter value" />
            </FormControl>
            <FormDescription>Helpful description</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  )
}

buildThemeTest("Form", () => <FormTestWrapper />)

buildThemeTest("Chart", () => (
  <ChartContainer
    config={{
      views: { label: "Views", color: "hsl(var(--chart-1))" },
    }}
  >
    <RechartsPrimitive.BarChart data={[{ name: "A", views: 100 }]}>
      <RechartsPrimitive.Bar dataKey="views" fill="var(--color-views)" />
    </RechartsPrimitive.BarChart>
  </ChartContainer>
))
