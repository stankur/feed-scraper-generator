import asyncio
import sys
import os
import json
from browser_use import Agent, Browser, ChatAnthropic
from dotenv import load_dotenv

load_dotenv()

class SonnetTieredCostTracker:
    def __init__(self):
        self.total_cost = 0.0
        self.step_count = 0
    
    def calculate_and_print(self, usage_entry):
        self.step_count += 1
        
        prompt_tokens = usage_entry.usage.prompt_tokens
        completion_tokens = usage_entry.usage.completion_tokens
        prompt_cached = usage_entry.usage.prompt_cached_tokens or 0
        cache_creation = usage_entry.usage.prompt_cache_creation_tokens or 0
        
        is_long_context = prompt_tokens > 200_000
        tier = '>200K' if is_long_context else '≤200K'
        
        uncached_prompt = prompt_tokens - prompt_cached
        if is_long_context and uncached_prompt > 200_000:
            prompt_cost = (200_000 * 3 / 1_000_000) + ((uncached_prompt - 200_000) * 6 / 1_000_000)
        else:
            rate = 6 if is_long_context else 3
            prompt_cost = uncached_prompt * rate / 1_000_000
        
        cache_read_rate = 0.60 if is_long_context else 0.30
        cache_read_cost = prompt_cached * cache_read_rate / 1_000_000
        
        cache_write_rate = 7.50 if is_long_context else 3.75
        cache_creation_cost = cache_creation * cache_write_rate / 1_000_000
        
        output_rate = 22.50 if is_long_context else 15
        output_cost = completion_tokens * output_rate / 1_000_000
        
        step_total = prompt_cost + cache_read_cost + cache_creation_cost + output_cost
        self.total_cost += step_total
        
        print(f"\n💰 Step {self.step_count} [{tier}] - ${step_total:.4f}")
        print(f"   📥 Input: {prompt_tokens:,} tokens (${prompt_cost:.4f})")
        if prompt_cached > 0:
            print(f"   💾 Cached: {prompt_cached:,} tokens (${cache_read_cost:.4f})")
        if cache_creation > 0:
            print(f"   🔧 Cache write: {cache_creation:,} tokens (${cache_creation_cost:.4f})")
        print(f"   📤 Output: {completion_tokens:,} tokens (${output_cost:.4f})")
        print(f"   💵 Running total: ${self.total_cost:.4f}")

async def monitor_costs(agent, tracker, cost_limit, agent_task):
    last_count = 0
    while True:
        await asyncio.sleep(0.1)
        current_count = len(agent.token_cost_service.usage_history)
        if current_count > last_count:
            for entry in agent.token_cost_service.usage_history[last_count:]:
                tracker.calculate_and_print(entry)
            last_count = current_count
            
            if tracker.total_cost > cost_limit:
                print(f"\n🛑 COST LIMIT EXCEEDED: ${tracker.total_cost:.4f} > ${cost_limit:.4f}")
                print("Stopping agent...")
                agent_task.cancel()
                break

async def discover_urls(company: str):
    llm = ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
    
    browser = Browser(
        headless=False,
        keep_alive=False,
    )
    
    task = f"""
I want to find the blog URLs that contain content for engineers to learn from and would find useful, not news releases, product news, investment announcements. Right now I want to do this for {company}.

Notice that it might be easier to find the blog of this company, but I need more specific. Often there are multiple URLs in the blog feed for different categories. I want that level of granularity - the most tagged, categorized, drilled down URLs with the highest density of content for engineers to learn from, not only promotion.

If there are different categories, and one of them is "all posts" or something like that, investigate whetehr the all posts is useful for technical people / founders / product engineers with transferable knowledge.

If it is a mix of marketing content, product releases, and technical content, pick the URLs that are most likely to be useful for technical people / founders / product engineers with transferable knowledge.
But if it seems like they are all worth for technical people, then just pick that URL (the one with all posts), no need to go and explore the different categories.


It would be best to simply try to google "<company name> engineering blogs" first as a starting point, because their engineering blog might not even be in the same domain as the company.

Honestly just keep it simple, when you find one that is like the main one, just get done with it. Don't overthink trying to go to too much URLs. I just need at least one where there is the good engineering feed. else you're gonna blow up the budget.

Your final output should be a JSON object like this:
{{
  "company": "{company}",
  "urls": [
    "https://specific-engineering-category-url",
    "https://another-technical-category-url"
  ]
}}

Or if no suitable engineering content exists:
{{
  "company": "{company}",
  "urls": []
}}

Use the done action with this JSON once you've investigated.
"""
    
    print(f"🔍 Discovering engineering blog URLs for {company}...\n")
    
    agent = Agent(
        task=task,
        llm=llm,
        browser=browser,
        calculate_cost=True,
        save_conversation_path=f"logs/{company.lower().replace(' ', '_')}_conversation.json",
    )
    
    cost_tracker = SonnetTieredCostTracker()
    cost_limit = 0.50
    
    agent_task = asyncio.create_task(agent.run(max_steps=30))
    monitor_task = asyncio.create_task(monitor_costs(agent, cost_tracker, cost_limit, agent_task))
    
    cost_limit_exceeded = False
    try:
        history = await agent_task
    except asyncio.CancelledError:
        cost_limit_exceeded = True
        print("\n⚠️  Agent stopped due to cost limit")
        history = agent.history
    finally:
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass
    
    print("\n" + "="*60)
    print("📊 RESULTS")
    print("="*60)
    
    if cost_limit_exceeded:
        print(f"\n⚠️  Stopped early - cost limit reached (${cost_limit:.2f})")
    else:
        print(f"\n✅ Completed in {history.number_of_steps()} steps")
    print(f"⏱️  Duration: {history.total_duration_seconds():.1f}s")
    print(f"💵 Total cost: ${cost_tracker.total_cost:.4f}")
    
    if history.is_done() or cost_limit_exceeded:
        result = history.final_result() if history.is_done() else None
        
        if result is None and cost_limit_exceeded:
            print(f"\n⚠️  No final result - agent stopped before completion")
        else:
            try:
                if isinstance(result, str):
                    parsed = json.loads(result)
                else:
                    parsed = result
                
                urls = parsed.get('urls', [])
                if urls:
                    print(f"\n🎯 Found {len(urls)} URL(s) for {parsed.get('company', company)}:")
                    for url in urls:
                        print(f"  • {url}")
                else:
                    print(f"\n⚠️  No suitable engineering blog found for {parsed.get('company', company)}")
                    print(f"  (Content is likely too promotional or not technical)")
                
                output_file = f"{company.lower().replace(' ', '_')}_urls.json"
                with open(output_file, 'w') as f:
                    json.dump(parsed, f, indent=2)
                print(f"\n💾 Saved to: {output_file}")
                
            except (json.JSONDecodeError, TypeError) as e:
                print(f"\n⚠️  Could not parse JSON, raw result:")
                print(result)
        
        print(f"\n📍 Visited URLs:")
        for i, url in enumerate(history.urls(), 1):
            print(f"  {i}. {url}")
        
        print(f"\n🔧 Actions taken:")
        for i, action in enumerate(history.action_names(), 1):
            print(f"  {i}. {action}")
        
    else:
        print("\n❌ Agent did not complete successfully")
    
    if history.has_errors():
        print(f"\n⚠️  Errors:")
        for error in history.errors():
            if error:
                print(f"  - {error}")
    
    print("\n" + "="*60)
    print(f"💾 Full conversation: logs/{company.lower().replace(' ', '_')}_conversation.json")
    print("="*60)
    
    input("\n👀 Browser still open. Press Enter to close...")
    
    return history

async def main():
    if len(sys.argv) < 2:
        print("Usage: python discover-url.py <company_name>")
        print("Example: python discover-url.py Temporal")
        sys.exit(1)
    
    company = sys.argv[1]
    os.makedirs("logs", exist_ok=True)
    await discover_urls(company)

if __name__ == "__main__":
    asyncio.run(main())

