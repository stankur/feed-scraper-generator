import asyncio
import sys
import os
import json
from browser_use import Agent, Browser, ChatAnthropic
from dotenv import load_dotenv
from discover_shared import SonnetTieredCostTracker, monitor_costs, get_discovery_task

load_dotenv()

async def discover_urls(company: str):
    llm = ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
    
    browser = Browser(
        headless=False,
        keep_alive=False,
    )
    
    task = get_discovery_task(company)
    
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

