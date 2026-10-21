import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://havkqpgyljqckvykscgu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdmtxcGd5bGpxY2t2eWtzY2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MTU4MjksImV4cCI6MjEwNzk5MTgyOX0.dHYfVXBrOkfYJrmnfmxLphh7PSaAIvkcG32mXjcTWok";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

