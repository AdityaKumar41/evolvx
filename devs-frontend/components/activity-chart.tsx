"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ActivityData {
  date: string;
  count: number;
}

interface ActivityChartProps {
  data?: ActivityData[];
  title?: string;
  description?: string;
}

export function ActivityChart({
  data = [],
  title = "Project Activity",
  description = "Contribution activity over the past year",
}: ActivityChartProps) {
  // Generate the last 365 days
  const generateDates = () => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date);
    }
    return dates;
  };

  const dates = generateDates();

  // Create a map of date to count
  const dataMap = new Map(data.map((item) => [item.date, item.count]));

  // Group dates by week
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];

  dates.forEach((date, index) => {
    currentWeek.push(date);
    if (date.getDay() === 6 || index === dates.length - 1) {
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });

  // Get color intensity based on count
  const getColorClass = (count: number) => {
    if (count === 0) return "bg-muted hover:bg-muted/80";
    if (count <= 2)
      return "bg-emerald-200 dark:bg-emerald-900/40 hover:bg-emerald-300 dark:hover:bg-emerald-800/60";
    if (count <= 5)
      return "bg-emerald-400 dark:bg-emerald-700/60 hover:bg-emerald-500 dark:hover:bg-emerald-600/80";
    if (count <= 10)
      return "bg-emerald-600 dark:bg-emerald-500/80 hover:bg-emerald-700 dark:hover:bg-emerald-400";
    return "bg-emerald-800 dark:bg-emerald-400 hover:bg-emerald-900 dark:hover:bg-emerald-300";
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const days = ["Mon", "Wed", "Fri"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-3">
            {/* Month labels */}
            <div className="flex gap-[2px] pl-8">
              {months.map((month, i) => (
                <div
                  key={month}
                  className="text-[10px] text-muted-foreground"
                  style={{
                    width: `${100 / 12}%`,
                    textAlign: "left",
                  }}
                >
                  {month}
                </div>
              ))}
            </div>

            {/* Activity grid */}
            <div className="flex gap-1">
              {/* Day labels */}
              <div className="flex flex-col gap-[2px] justify-between pr-2">
                {days.map((day) => (
                  <div
                    key={day}
                    className="text-[10px] text-muted-foreground h-3 flex items-center"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              <div className="flex gap-[2px] flex-1 overflow-x-auto">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[2px]">
                    {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                      const date = week.find((d) => d.getDay() === dayIndex);
                      if (!date)
                        return <div key={dayIndex} className="w-3 h-3" />;

                      const dateStr = date.toISOString().split("T")[0];
                      const count = dataMap.get(dateStr) || 0;

                      return (
                        <Tooltip key={dayIndex}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "w-3 h-3 rounded-sm transition-colors cursor-pointer",
                                getColorClass(count)
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              <span className="font-semibold">
                                {count} contribution{count !== 1 ? "s" : ""}
                              </span>
                              <br />
                              {formatDate(date)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-muted" />
                <div className="w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/40" />
                <div className="w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-700/60" />
                <div className="w-3 h-3 rounded-sm bg-emerald-600 dark:bg-emerald-500/80" />
                <div className="w-3 h-3 rounded-sm bg-emerald-800 dark:bg-emerald-400" />
              </div>
              <span>More</span>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
